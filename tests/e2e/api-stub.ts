import type { Page, Route } from '@playwright/test'
import { createSeedState } from '../../src/domain/seed'
import type { AppState, Review } from '../../src/domain/types'
import type { WorkspaceRole } from '../../src/services/contracts'

type Role = Extract<WorkspaceRole, 'owner' | 'organizer' | 'reviewer' | 'speaker'>

export interface ApiStubOptions {
  role?: Role
  email?: string
  state?: AppState
  hydrationFailure?: boolean
  failNextStateWrite?: boolean
  failNextReviewWrite?: boolean
}

export interface ApiStubControl {
  readonly state: AppState
  readonly revision: number
  stateWrites: AppState[]
  portalWrites: Array<Record<string, unknown>>
  reviewWrites: Array<Record<string, unknown>>
  cfpSubmissions: Array<Record<string, unknown>>
  failNextStateWrite(): void
  failNextReviewWrite(): void
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function publicProjection(state: AppState): AppState {
  const submissions = state.submissions.filter((submission) => submission.status === 'accepted')
  const publishedIds = new Set(state.sessions.filter((session) => session.published).map((session) => session.submissionId))
  const visibleSubmissions = submissions.filter((submission) => publishedIds.has(submission.id))
  const visibleSubmissionIds = new Set(visibleSubmissions.map((submission) => submission.id))
  const speakerIds = new Set(visibleSubmissions.flatMap((submission) => submission.speakerIds))
  const { resources: _resources, cfp: _cfp, ...event } = state.event
  return {
    ...state,
    event,
    submissions: visibleSubmissions,
    sessions: state.sessions.filter((session) => session.published && visibleSubmissionIds.has(session.submissionId)),
    speakers: state.speakers.filter((speaker) => speaker.status === 'confirmed' && speakerIds.has(speaker.id)).map((speaker) => ({ ...speaker, email: '', availability: [] })),
    reviews: [],
    tasks: [],
    templates: [],
    communicationLog: [],
    evaluationPlans: [],
    evaluationRounds: [],
    evaluationAssignments: [],
    evaluationAdvancements: [],
  }
}

function json(route: Route, data: unknown, status = 200, headers: Record<string, string> = {}) {
  return route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(data) })
}

function error(route: Route, status: number, code: string, message: string) {
  return json(route, { error: { code, message, requestId: `e2e-${code.toLowerCase()}` } }, status)
}

export async function installApiStub(page: Page, options: ApiStubOptions = {}): Promise<ApiStubControl> {
  let currentState = clone(options.state ?? createSeedState())
  let revision = 7
  let rejectNextStateWrite = Boolean(options.failNextStateWrite)
  let rejectNextReviewWrite = Boolean(options.failNextReviewWrite)
  const role = options.role ?? 'owner'
  const email = options.email ?? (role === 'reviewer' ? 'sarah@example.com' : role === 'speaker' ? 'priya@example.com' : 'owner@example.com')
  const stateWrites: AppState[] = []
  const portalWrites: Array<Record<string, unknown>> = []
  const reviewWrites: Array<Record<string, unknown>> = []
  const cfpSubmissions: Array<Record<string, unknown>> = []

  const openRound = currentState.evaluationRounds?.find((round) => round.status === 'open')
  if (openRound) {
    openRound.opensAt = new Date(Date.now() - 86_400_000).toISOString()
    openRound.dueAt = new Date(Date.now() + 86_400_000).toISOString()
  }

  const control: ApiStubControl = {
    get state() { return currentState },
    get revision() { return revision },
    stateWrites,
    portalWrites,
    reviewWrites,
    cfpSubmissions,
    failNextStateWrite() { rejectNextStateWrite = true },
    failNextReviewWrite() { rejectNextReviewWrite = true },
  }

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

    if (options.hydrationFailure && path.endsWith('/session')) return error(route, 503, 'DATABASE_UNAVAILABLE', 'The shared workspace is temporarily unavailable.')

    if (path === '/api/health') return json(route, { data: { status: 'ok', database: 'ok', files: true, timestamp: new Date().toISOString() } })

    if (/\/api\/public\/cfp\/[^/]+\/[^/]+$/.test(path)) {
      if (method === 'GET') {
        const cfpState = publicProjection(currentState)
        cfpState.event = { ...cfpState.event, cfp: currentState.event.cfp }
        return json(route, { data: { event: { id: currentState.event.id, name: currentState.event.name, slug: currentState.event.slug }, config: currentState.event.cfp ?? {}, revision, state: cfpState } }, 200, { ETag: `"${revision}"` })
      }
      if (method === 'POST') {
        const input = request.postDataJSON() as Record<string, unknown>
        cfpSubmissions.push(input)
        return json(route, { data: { id: `submission-e2e-${cfpSubmissions.length}`, status: 'needs-review', submittedAt: new Date().toISOString() } }, 201)
      }
    }

    if (/\/api\/public\/events\/[^/]+\/[^/]+\/state$/.test(path) && method === 'GET') {
      return json(route, { data: { event: { id: currentState.event.id, name: currentState.event.name, slug: currentState.event.slug }, revision, state: publicProjection(currentState), updatedAt: currentState.lastUpdatedAt } }, 200, { ETag: `"${revision}"` })
    }

    if (path.endsWith('/session') && method === 'GET') {
      return json(route, { data: { user: { id: `user-${role}`, email, name: role === 'reviewer' ? 'Sarah Lin' : role === 'speaker' ? 'Priya Rao' : 'Release Owner' }, role } })
    }

    if (path.endsWith('/state')) {
      if (method === 'GET') return json(route, { data: { event: { id: currentState.event.id, name: currentState.event.name, slug: currentState.event.slug, cfpOpen: currentState.event.cfp?.open === true, cfpConfig: currentState.event.cfp ?? {} }, revision, state: currentState, ingestion: { source: 'public-cfp', importedCount: 0, sourceRecordCount: 0 }, updatedAt: currentState.lastUpdatedAt } }, 200, { ETag: `"${revision}"` })
      if (method === 'PUT') {
        if (rejectNextStateWrite) {
          rejectNextStateWrite = false
          currentState = { ...currentState, event: { ...currentState.event, venue: 'Remote collaborator venue' } }
          revision += 1
          return error(route, 409, 'REVISION_CONFLICT', 'Another collaborator changed this record.')
        }
        const input = request.postDataJSON() as { expectedRevision: number; state: AppState }
        if (input.expectedRevision !== revision) return error(route, 409, 'REVISION_CONFLICT', 'Another collaborator changed this record.')
        currentState = clone(input.state)
        stateWrites.push(clone(currentState))
        revision += 1
        return json(route, { data: { eventId: currentState.event.id, revision, updatedAt: new Date().toISOString() } }, 200, { ETag: `"${revision}"` })
      }
    }

    if (path.endsWith('/reviewer-queue') && method === 'GET') {
      const assignments = (currentState.evaluationAssignments ?? []).filter((assignment) => assignment.reviewerEmail.toLowerCase() === email.toLowerCase())
      const submissionIds = new Set(assignments.map((assignment) => assignment.submissionId))
      const roundIds = new Set(assignments.map((assignment) => assignment.roundId))
      const rounds = (currentState.evaluationRounds ?? []).filter((round) => roundIds.has(round.id))
      const planIds = new Set(rounds.map((round) => round.planId))
      const submissions = currentState.submissions.filter((submission) => submissionIds.has(submission.id))
      const speakerIds = new Set(submissions.flatMap((submission) => submission.speakerIds))
      const reviews = currentState.reviews.filter((review) => assignments.some((assignment) => assignment.id === review.assignmentId))
      return json(route, { data: { revision, event: currentState.event, assignments, rounds, plans: (currentState.evaluationPlans ?? []).filter((plan) => planIds.has(plan.id)), submissions, speakers: currentState.speakers.filter((speaker) => speakerIds.has(speaker.id)), reviews } }, 200, { ETag: `"${revision}"` })
    }

    if (path.endsWith('/reviews') && method === 'POST') {
      if (rejectNextReviewWrite) {
        rejectNextReviewWrite = false
        return error(route, 503, 'DATABASE_UNAVAILABLE', 'The review service is temporarily unavailable.')
      }
      const input = request.postDataJSON() as Record<string, unknown> & { assignmentId: string; submissionId: string; review: { scores: Record<string, number>; note?: string }; assignmentStatus?: string }
      reviewWrites.push(input)
      const assignment = (currentState.evaluationAssignments ?? []).find((item) => item.id === input.assignmentId)!
      const updatedAssignment = { ...assignment, status: input.assignmentStatus ?? 'completed', updatedAt: new Date().toISOString() }
      currentState = {
        ...currentState,
        evaluationAssignments: (currentState.evaluationAssignments ?? []).map((item) => item.id === assignment.id ? updatedAssignment : item),
        reviews: [...currentState.reviews.filter((item) => item.assignmentId !== assignment.id), { id: `review-${assignment.id}`, assignmentId: assignment.id, submissionId: input.submissionId, roundId: assignment.roundId, reviewerName: 'Sarah Lin', reviewerEmail: email, scores: input.review.scores, note: input.review.note, updatedAt: new Date().toISOString() } as Review],
      }
      revision += 1
      return json(route, { data: { revision, review: currentState.reviews.at(-1), assignment: updatedAssignment } }, 200, { ETag: `"${revision}"` })
    }

    if (path.endsWith('/speaker-portal')) {
      const speaker = currentState.speakers.find((item) => item.email.toLowerCase() === email.toLowerCase()) ?? currentState.speakers[0]
      const portal = () => ({ event: currentState.event, speaker, submissions: currentState.submissions.filter((submission) => submission.speakerIds.includes(speaker.id)), tasks: currentState.tasks.filter((task) => task.speakerId === speaker.id), sessions: currentState.sessions.filter((session) => currentState.submissions.some((submission) => submission.id === session.submissionId && submission.speakerIds.includes(speaker.id))), resources: currentState.event.resources ?? [], assets: [] })
      if (method === 'GET') return json(route, { data: { revision, portal: portal() } }, 200, { ETag: `"${revision}"` })
      if (method === 'PATCH') {
        const input = request.postDataJSON() as Record<string, unknown> & { profile?: Record<string, unknown>; taskUpdates?: Array<{ id: string; completed?: boolean }> }
        portalWrites.push(input)
        currentState = {
          ...currentState,
          speakers: currentState.speakers.map((item) => item.id === speaker.id ? { ...item, ...input.profile, updatedAt: new Date().toISOString() } : item),
          tasks: currentState.tasks.map((task) => {
            const update = input.taskUpdates?.find((item) => item.id === task.id)
            return update ? { ...task, completedAt: update.completed ? new Date().toISOString() : undefined, updatedAt: new Date().toISOString() } : task
          }),
        }
        revision += 1
        const updatedSpeaker = currentState.speakers.find((item) => item.id === speaker.id)!
        return json(route, { data: { revision, portal: { ...portal(), speaker: updatedSpeaker } } }, 200, { ETag: `"${revision}"` })
      }
    }

    if (path.endsWith('/integrations') && method === 'GET') return json(route, { data: { configured: { resend: false, accelevents: false }, runs: [], deliveries: [] } })
    if (path.endsWith('/members') && method === 'GET') return json(route, { data: [] })
    if (path.endsWith('/audit') && method === 'GET') return json(route, { data: [] })

    return error(route, 404, 'API_ROUTE_NOT_FOUND', `No E2E stub exists for ${method} ${path}.`)
  })

  return control
}
