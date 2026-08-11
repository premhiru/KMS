import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { APP_SCHEMA_VERSION, type AppState, type EvaluationPlan, type EvaluationRound, type ResourcePage } from '../domain/types'
import {
  ApiError,
  OpenSpeakerApiClient,
  type PublicCfpSubmissionInput,
  type ReviewerMutationInput,
  type ReviewerQueue,
  type SpeakerPortalProjection,
  type WorkspaceSession,
} from '../services'
import { AppContext } from './app-context'
import { appReducer } from './reducer'
import { exportAppState, importAppState, loadAppState, resetAppState, saveAppState } from './storage'

export interface AppProviderProps {
  children: ReactNode
  initialState?: AppState
  storage?: Storage
}

function portalToState(portal: SpeakerPortalProjection): AppState {
  const resources = portal.resources.map((resource) => ({
    id: resource.id, title: resource.title, body: resource.body ?? resource.description ?? '', embedUrl: resource.embedUrl ?? resource.url,
  })) as ResourcePage[]
  return {
    schemaVersion: APP_SCHEMA_VERSION,
    lastUpdatedAt: new Date().toISOString(),
    event: { ...portal.event, resources },
    speakers: [portal.speaker], submissions: portal.submissions, reviews: [], tasks: portal.tasks, sessions: portal.sessions,
    templates: [], communicationLog: [], evaluationPlans: [], evaluationRounds: [], evaluationAssignments: [], evaluationAdvancements: [],
  }
}

function queueToState(queue: ReviewerQueue): AppState {
  const rich = queue as ReviewerQueue & { event: AppState['event']; rounds?: EvaluationRound[]; plans?: EvaluationPlan[] }
  return {
    schemaVersion: APP_SCHEMA_VERSION,
    lastUpdatedAt: new Date().toISOString(),
    event: rich.event,
    speakers: queue.speakers, submissions: queue.submissions, reviews: queue.reviews, tasks: [], sessions: [], templates: [], communicationLog: [],
    evaluationPlans: rich.plans ?? [], evaluationRounds: rich.rounds ?? [], evaluationAssignments: queue.assignments, evaluationAdvancements: [],
  }
}

export function AppProvider({ children, initialState, storage }: AppProviderProps) {
  const seedState = useMemo(() => initialState ?? loadAppState(storage), [initialState, storage])
  const [state, dispatch] = useReducer(appReducer, seedState)
  const [persistenceError, setPersistenceError] = useState<string>()
  const remote = import.meta.env.PROD || import.meta.env.VITE_REMOTE_API === 'true'
  const api = useMemo(() => remote ? new OpenSpeakerApiClient({
    workspaceId: import.meta.env.VITE_WORKSPACE_ID || 'workspace-premhiru-kms',
    eventId: import.meta.env.VITE_EVENT_ID || seedState.event.id,
    eventSlug: import.meta.env.VITE_EVENT_SLUG || seedState.event.slug,
  }) : undefined, [remote, seedState.event.id, seedState.event.slug])
  const [persistenceMode, setPersistenceMode] = useState<'local' | 'remote' | 'public-readonly'>(remote ? 'remote' : 'local')
  const [syncStatus, setSyncStatus] = useState<'loading' | 'saved' | 'saving' | 'error' | 'unauthorized'>(remote ? 'loading' : 'saved')
  const [session, setSession] = useState<WorkspaceSession>()
  const revisionRef = useRef<number | null>(null)
  const hydratedRef = useRef(!remote)
  const pendingStateRef = useRef(state)
  const savedStateRef = useRef<AppState | null>(remote ? null : state)
  const savingRef = useRef(false)

  const acceptLoaded = useCallback((nextState: AppState, revision: number) => {
    revisionRef.current = revision
    savedStateRef.current = nextState
    pendingStateRef.current = nextState
    dispatch({ type: 'state/replace', state: nextState })
    hydratedRef.current = true
    setSyncStatus('saved')
    setPersistenceError(undefined)
  }, [])

  useEffect(() => {
    if (!api) return
    const controller = new AbortController()
    const cfpRoute = window.location.hash.startsWith('#/cfp')
    const eventRoute = window.location.hash.startsWith('#/event')
    void (async () => {
      try {
        if (cfpRoute || eventRoute) {
          const loaded = cfpRoute ? await api.getPublicCfp({ signal: controller.signal }) : await api.getPublicEvent({ signal: controller.signal })
          const publicState = 'state' in loaded ? loaded.state : undefined
          if (!publicState) throw new Error('This public event has not been initialized.')
          setPersistenceMode('public-readonly')
          acceptLoaded(publicState, loaded.revision)
          return
        }

        let identity: WorkspaceSession | undefined
        try {
          identity = await api.getSession({ signal: controller.signal })
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 403) throw error
        }

        if (identity?.role === 'owner' || identity?.role === 'organizer') {
          setSession(identity)
          try {
            const loaded = await api.getState({ signal: controller.signal })
            acceptLoaded(loaded.state, loaded.revision)
          } catch (error) {
            if (!(error instanceof ApiError) || error.code !== 'EVENT_STATE_NEEDS_SEED') throw error
            try {
              const seeded = await api.putState(seedState, { revision: 0, signal: controller.signal })
              acceptLoaded(seeded.state, seeded.revision)
            } catch (seedError) {
              if (!(seedError instanceof ApiError) || seedError.code !== 'REVISION_CONFLICT') throw seedError
              const loaded = await api.getState({ signal: controller.signal })
              acceptLoaded(loaded.state, loaded.revision)
            }
          }
          return
        }

        if (identity?.role === 'reviewer') {
          setSession(identity)
          const queue = await api.getReviewerQueue({ signal: controller.signal })
          acceptLoaded(queueToState(queue), queue.revision)
          return
        }

        const portal = await api.getSpeakerPortal({ signal: controller.signal })
        const speakerSession = identity ?? { user: { id: '', email: portal.portal.speaker.email, name: `${portal.portal.speaker.firstName} ${portal.portal.speaker.lastName}` }, role: 'speaker' as const }
        setSession(speakerSession)
        acceptLoaded(portalToState(portal.portal), portal.revision)
      } catch (error) {
        if (controller.signal.aborted) return
        const unauthorized = error instanceof ApiError && (error.status === 401 || error.status === 403)
        setSyncStatus(unauthorized ? 'unauthorized' : 'error')
        setPersistenceError(error instanceof Error ? error.message : 'Unable to load the shared workspace.')
      }
    })()
    return () => controller.abort()
  }, [acceptLoaded, api, seedState])

  useEffect(() => {
    pendingStateRef.current = state
    if (!api) {
      const result = saveAppState(state, storage)
      setPersistenceError(result.ok ? undefined : result.error)
      return
    }
    if (!hydratedRef.current || persistenceMode !== 'remote' || state === savedStateRef.current || session?.role === 'reviewer') return
    const timer = window.setTimeout(() => {
      if (savingRef.current) return
      savingRef.current = true
      void (async () => {
        try {
          while (pendingStateRef.current !== savedStateRef.current) {
            setSyncStatus('saving')
            const nextState = pendingStateRef.current
            const revision = revisionRef.current
            if (revision === null) return
            try {
              if (session?.role === 'speaker') {
                const speaker = nextState.speakers[0]
                if (!speaker) throw new Error('The signed-in speaker profile is unavailable.')
                const saved = await api.patchSpeakerPortal({
                  expectedRevision: revision,
                  profile: { firstName: speaker.firstName, lastName: speaker.lastName, company: speaker.company, jobTitle: speaker.jobTitle, bio: speaker.bio, pronouns: speaker.pronouns, photoUrl: speaker.photoUrl, availability: speaker.availability, status: speaker.status },
                  taskUpdates: nextState.tasks.map((task) => ({ id: task.id, completed: Boolean(task.completedAt), assetId: task.asset?.id })),
                })
                const projected = portalToState(saved.portal)
                revisionRef.current = saved.revision
                savedStateRef.current = projected
                pendingStateRef.current = projected
                dispatch({ type: 'state/replace', state: projected })
              } else {
                const saved = await api.putState(nextState, { revision })
                revisionRef.current = saved.revision
                savedStateRef.current = nextState
              }
            } catch (error) {
              if (error instanceof ApiError && error.code === 'REVISION_CONFLICT') throw new Error('Another collaborator changed this record. Reload the page before retrying.')
              throw error
            }
          }
          setPersistenceError(undefined)
          setSyncStatus('saved')
        } catch (error) {
          setPersistenceError(error instanceof Error ? error.message : 'Unable to save the shared workspace.')
          setSyncStatus('error')
        } finally {
          savingRef.current = false
        }
      })()
    }, 450)
    return () => window.clearTimeout(timer)
  }, [api, persistenceMode, session?.role, state, storage])

  const reset = useCallback(() => dispatch({ type: 'state/replace', state: resetAppState(storage) }), [storage])
  const importJson = useCallback((json: string) => { const result = importAppState(json); if (result.ok) dispatch({ type: 'state/replace', state: result.value }); return result }, [])
  const exportJson = useCallback(() => exportAppState(state), [state])
  const submitCfp = useCallback(async (input: PublicCfpSubmissionInput) => { if (!api) throw new Error('Public submission transport is available on the deployed application.'); return api.submitCfp(input) }, [api])
  const uploadAsset = useCallback(async (file: File) => { if (!api || persistenceMode !== 'remote') throw new Error('Durable file storage is available to authenticated users on the deployed application.'); return api.uploadAsset(file) }, [api, persistenceMode])
  const downloadAsset = useCallback(async (assetId: string) => { if (!api || persistenceMode !== 'remote') throw new Error('Durable file storage is available to authenticated users on the deployed application.'); return api.downloadAsset(assetId) }, [api, persistenceMode])
  const submitAssignedReview = useCallback(async (input: Omit<ReviewerMutationInput, 'expectedRevision'>) => {
    if (!api || revisionRef.current === null || session?.role !== 'reviewer') throw new Error('A signed-in reviewer assignment is required.')
    setSyncStatus('saving')
    try {
      await api.submitReview({ ...input, expectedRevision: revisionRef.current })
      const queue = await api.getReviewerQueue()
      acceptLoaded(queueToState(queue), queue.revision)
    } catch (error) {
      setSyncStatus('error')
      setPersistenceError(error instanceof Error ? error.message : 'The review could not be saved.')
      throw error
    }
  }, [acceptLoaded, api, session?.role])

  const value = useMemo(() => ({ state, dispatch, persistenceError, persistenceMode, syncStatus, api, session, reset, importJson, exportJson, submitCfp, uploadAsset, downloadAsset, submitAssignedReview }), [state, persistenceError, persistenceMode, syncStatus, api, session, reset, importJson, exportJson, submitCfp, uploadAsset, downloadAsset, submitAssignedReview])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
