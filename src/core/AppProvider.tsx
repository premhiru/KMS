import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { APP_SCHEMA_VERSION, type AppState, type EvaluationPlan, type EvaluationRound, type ResourcePage } from '../domain/types'
import {
  ApiError,
  OpenSpeakerApiClient,
  type PublicCfpSubmissionInput,
  type PublicCfpClaimRequestInput,
  type ReviewerMutationInput,
  type ReviewerMutationReceipt,
  type ReviewerQueue,
  type SpeakerProposalMutationInput,
  type SpeakerPortalProjection,
  type WorkspaceSession,
} from '../services'
import { AppContext } from './app-context'
import { canAcceptRemoteSnapshot, rebaseAppState, reconcileSavedState } from './reconcile'
import { appReducer, type AppAction } from './reducer'
import { applyReviewerReceipt } from './review-reconcile'
import { exportAppState, importAppState, loadAppState, resetAppState, saveAppState } from './storage'

export interface AppProviderProps {
  children: ReactNode
  initialState?: AppState
  storage?: Storage
}

function portalToState(portal: SpeakerPortalProjection): AppState {
  const resources = portal.resources.map((resource) => ({
    id: resource.id, title: resource.title, body: resource.body ?? resource.description ?? '', embedUrl: resource.embedUrl ?? resource.url,
    version: resource.version, approvalStatus: resource.approvalStatus, updatedAt: resource.updatedAt, files: resource.files,
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
  const [state, reducerDispatch] = useReducer(appReducer, seedState)
  const [persistenceError, setPersistenceError] = useState<string>()
  const remote = import.meta.env.PROD || import.meta.env.VITE_REMOTE_API === 'true'
  const api = useMemo(() => remote ? new OpenSpeakerApiClient({
    workspaceId: import.meta.env.VITE_WORKSPACE_ID || 'workspace-premhiru-kms',
    eventId: new URLSearchParams(window.location.search).get('eventId') || import.meta.env.VITE_EVENT_ID || seedState.event.id,
    eventSlug: new URLSearchParams(window.location.search).get('eventSlug') || import.meta.env.VITE_EVENT_SLUG || seedState.event.slug,
  }) : undefined, [remote, seedState.event.id, seedState.event.slug])
  const [persistenceMode, setPersistenceMode] = useState<'local' | 'remote' | 'public-readonly' | 'static-readonly'>(remote ? 'remote' : 'local')
  const [syncStatus, setSyncStatus] = useState<'loading' | 'saved' | 'saving' | 'error' | 'unauthorized'>(remote ? 'loading' : 'saved')
  const [session, setSession] = useState<WorkspaceSession>()
  const revisionRef = useRef<number | null>(null)
  const hydratedRef = useRef(!remote)
  const pendingStateRef = useRef(state)
  const savedStateRef = useRef<AppState | null>(remote ? null : state)
  const savingRef = useRef(false)
  const reviewerSavingRef = useRef(false)
  const pollingRef = useRef(false)
  const pollGenerationRef = useRef(0)
  const localMutationVersionRef = useRef(0)

  const dispatch = useCallback((action: AppAction) => {
    localMutationVersionRef.current += 1
    pendingStateRef.current = appReducer(pendingStateRef.current, action)
    reducerDispatch(action)
  }, [])

  const acceptLoaded = useCallback((nextState: AppState, revision: number) => {
    revisionRef.current = revision
    savedStateRef.current = nextState
    pendingStateRef.current = nextState
    reducerDispatch({ type: 'state/replace', state: nextState })
    hydratedRef.current = true
    setSyncStatus('saved')
    setPersistenceError(undefined)
  }, [])

  useEffect(() => {
    if (!api) return
    const controller = new AbortController()
    const docsRoute = window.location.hash.startsWith('#/docs')
    const cfpRoute = window.location.hash.startsWith('#/cfp')
    const eventRoute = window.location.hash.startsWith('#/event')
    void (async () => {
      try {
        if (docsRoute) {
          setPersistenceMode('static-readonly')
          acceptLoaded(seedState, 0)
          return
        }
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
          // An event-scoped CFP claim intentionally does not authenticate general workspace routes.
          // Continue to the narrowly scoped portal probe for both anonymous and non-member identities.
          if (!(error instanceof ApiError) || (error.status !== 401 && error.status !== 403)) throw error
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
    if (!api || !hydratedRef.current || persistenceMode === 'static-readonly') return
    const publicRoute = persistenceMode === 'public-readonly'
    const controller = new AbortController()
    const generation = ++pollGenerationRef.current
    const poll = async () => {
      if (pollingRef.current || savingRef.current || reviewerSavingRef.current || document.hidden || pendingStateRef.current !== savedStateRef.current) return
      pollingRef.current = true
      const requestMutationVersion = localMutationVersionRef.current
      const acceptPoll = (nextState: AppState, revision: number) => {
        if (canAcceptRemoteSnapshot({
          incomingRevision: revision,
          currentRevision: revisionRef.current,
          requestMutationVersion,
          currentMutationVersion: localMutationVersionRef.current,
          hasPendingChanges: pendingStateRef.current !== savedStateRef.current,
          isSaving: savingRef.current || reviewerSavingRef.current,
          isCurrentRequest: !controller.signal.aborted && pollGenerationRef.current === generation,
        })) acceptLoaded(nextState, revision)
      }
      try {
        if (publicRoute) {
          const loaded = window.location.hash.startsWith('#/cfp') ? await api.getPublicCfp({ signal: controller.signal }) : await api.getPublicEvent({ signal: controller.signal })
          if ('state' in loaded && loaded.state) acceptPoll(loaded.state, loaded.revision)
        } else if (session?.role === 'owner' || session?.role === 'organizer') {
          const loaded = await api.getState({ signal: controller.signal })
          acceptPoll(loaded.state, loaded.revision)
        } else if (session?.role === 'reviewer') {
          const loaded = await api.getReviewerQueue({ signal: controller.signal })
          acceptPoll(queueToState(loaded), loaded.revision)
        } else if (session?.role === 'speaker') {
          const loaded = await api.getSpeakerPortal({ signal: controller.signal })
          acceptPoll(portalToState(loaded.portal), loaded.revision)
        }
      } catch {
        // A transient poll failure must not replace already-hydrated, usable data.
      } finally {
        pollingRef.current = false
      }
    }
    const timer = window.setInterval(() => void poll(), publicRoute ? 10_000 : 2_000)
    return () => {
      window.clearInterval(timer)
      if (pollGenerationRef.current === generation) pollGenerationRef.current += 1
      controller.abort()
    }
  }, [acceptLoaded, api, persistenceMode, session?.role])

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
                const savedTasks = new Map((savedStateRef.current?.tasks ?? []).map((task) => [task.id, task]))
                const taskUpdates = nextState.tasks.flatMap((task) => {
                  const savedTask = savedTasks.get(task.id)
                  const completionChanged = Boolean(task.completedAt) !== Boolean(savedTask?.completedAt)
                  const assetChanged = task.asset?.id !== savedTask?.asset?.id
                  const savedCommentIds = new Set((savedTask?.comments ?? []).map((comment) => comment.id))
                  const newComments = (task.comments ?? []).filter((comment) => comment.authorRole === 'speaker' && !savedCommentIds.has(comment.id))
                  const base = completionChanged || assetChanged ? [{ id: task.id, completed: Boolean(task.completedAt), assetId: assetChanged ? task.asset?.id : undefined }] : []
                  return [...base, ...newComments.map((comment) => ({ id: task.id, newComment: { id: comment.id, body: comment.body, createdAt: comment.createdAt } }))]
                })
                const saved = await api.patchSpeakerPortal({
                  expectedRevision: revision,
                  profile: { firstName: speaker.firstName, lastName: speaker.lastName, company: speaker.company, jobTitle: speaker.jobTitle, bio: speaker.bio, pronouns: speaker.pronouns, photoUrl: speaker.photoUrl, twitterUrl: speaker.twitterUrl, linkedinUrl: speaker.linkedinUrl, travelPreferences: speaker.travelPreferences, availability: speaker.availability, status: speaker.status },
                  taskUpdates,
                })
                const projected = portalToState(saved.portal)
                const reconciled = reconcileSavedState(nextState, pendingStateRef.current, projected)
                revisionRef.current = saved.revision
                savedStateRef.current = projected
                pendingStateRef.current = reconciled
                reducerDispatch({ type: 'state/replace', state: reconciled })
              } else {
                const saved = await api.putState(nextState, { revision })
                const reconciled = reconcileSavedState(nextState, pendingStateRef.current, saved.state)
                revisionRef.current = saved.revision
                savedStateRef.current = saved.state
                pendingStateRef.current = reconciled
                reducerDispatch({ type: 'state/replace', state: reconciled })
              }
            } catch (error) {
              if (error instanceof ApiError && error.code === 'REVISION_CONFLICT') {
                const baseState = savedStateRef.current
                if (!baseState) throw new Error('The shared workspace changed before this edit could be saved. Reload and retry.')
                const latest = session?.role === 'speaker' ? await api.getSpeakerPortal() : await api.getState()
                const latestState = 'portal' in latest ? portalToState(latest.portal) : latest.state
                const rebased = rebaseAppState(baseState, pendingStateRef.current, latestState)
                revisionRef.current = latest.revision
                savedStateRef.current = latestState
                pendingStateRef.current = rebased
                reducerDispatch({ type: 'state/replace', state: rebased })
                continue
              }
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

  const reset = useCallback(() => dispatch({ type: 'state/replace', state: resetAppState(storage) }), [dispatch, storage])
  const importJson = useCallback((json: string) => { const result = importAppState(json); if (result.ok) dispatch({ type: 'state/replace', state: result.value }); return result }, [dispatch])
  const exportJson = useCallback(() => exportAppState(state), [state])
  const submitCfp = useCallback(async (input: PublicCfpSubmissionInput) => { if (!api) throw new Error('Public submission transport is available on the deployed application.'); return api.submitCfp(input) }, [api])
  const requestCfpClaim = useCallback(async (input: PublicCfpClaimRequestInput) => { if (!api) throw new Error('Secure proposal access is available on the deployed application.'); return api.requestCfpClaim(input) }, [api])
  const verifyCfpClaim = useCallback(async (token: string) => { if (!api) throw new Error('Secure proposal access is available on the deployed application.'); return api.verifyCfpClaim(token) }, [api])
  const uploadAsset = useCallback(async (file: File) => { if (!api || persistenceMode !== 'remote') throw new Error('Durable file storage is available to authenticated users on the deployed application.'); return api.uploadAsset(file) }, [api, persistenceMode])
  const downloadAsset = useCallback(async (assetId: string) => { if (!api || persistenceMode !== 'remote') throw new Error('Durable file storage is available to authenticated users on the deployed application.'); return api.downloadAsset(assetId) }, [api, persistenceMode])
  const saveSpeakerProposal = useCallback(async (input: Omit<SpeakerProposalMutationInput, 'expectedRevision'>, submissionId?: string) => {
    if (!api || revisionRef.current === null || session?.role !== 'speaker') throw new Error('A signed-in speaker profile is required.')
    setSyncStatus('saving')
    try {
      let receipt
      try {
        receipt = await api.saveSpeakerProposal({ ...input, expectedRevision: revisionRef.current }, submissionId)
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'REVISION_CONFLICT') throw error
        const latest = await api.getSpeakerPortal()
        acceptLoaded(portalToState(latest.portal), latest.revision)
        receipt = await api.saveSpeakerProposal({ ...input, expectedRevision: latest.revision }, submissionId)
      }
      const current = pendingStateRef.current
      const next = {
        ...current,
        lastUpdatedAt: new Date().toISOString(),
        submissions: current.submissions.some((item) => item.id === receipt.proposal.id)
          ? current.submissions.map((item) => item.id === receipt.proposal.id ? receipt.proposal : item)
          : [...current.submissions, receipt.proposal],
      }
      acceptLoaded(next, receipt.revision)
      return receipt.proposal
    } catch (error) {
      setPersistenceError(error instanceof Error ? error.message : 'The proposal could not be saved.')
      setSyncStatus('saved')
      throw error
    }
  }, [acceptLoaded, api, session?.role])
  const submitAssignedReview = useCallback(async (input: Omit<ReviewerMutationInput, 'expectedRevision'>) => {
    if (!api || revisionRef.current === null || session?.role !== 'reviewer') throw new Error('A signed-in reviewer assignment is required.')
    if (reviewerSavingRef.current) throw new Error('A review save is already in progress.')
    reviewerSavingRef.current = true
    setSyncStatus('saving')
    try {
      let receipt: ReviewerMutationReceipt
      let projection = pendingStateRef.current
      try {
        receipt = await api.submitReview({ ...input, expectedRevision: revisionRef.current })
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'REVISION_CONFLICT') throw error
        const latest = await api.getReviewerQueue()
        revisionRef.current = latest.revision
        projection = queueToState(latest)
        receipt = await api.submitReview({ ...input, expectedRevision: latest.revision })
      }
      acceptLoaded(applyReviewerReceipt(projection, receipt), receipt.revision)
      try {
        const queue = await api.getReviewerQueue()
        if (queue.revision >= receipt.revision) acceptLoaded(queueToState(queue), queue.revision)
      } catch {
        // The mutation receipt is authoritative; a transient refresh failure must not report the saved review as failed.
      }
    } catch (error) {
      setSyncStatus('error')
      setPersistenceError(error instanceof Error ? error.message : 'The review could not be saved.')
      throw error
    } finally {
      reviewerSavingRef.current = false
    }
  }, [acceptLoaded, api, session?.role])

  const value = useMemo(() => ({ state, dispatch, persistenceError, persistenceMode, syncStatus, api, session, reset, importJson, exportJson, submitCfp, requestCfpClaim, verifyCfpClaim, uploadAsset, downloadAsset, saveSpeakerProposal, submitAssignedReview }), [state, dispatch, persistenceError, persistenceMode, syncStatus, api, session, reset, importJson, exportJson, submitCfp, requestCfpClaim, verifyCfpClaim, uploadAsset, downloadAsset, saveSpeakerProposal, submitAssignedReview])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
