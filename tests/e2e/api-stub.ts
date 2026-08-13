import type { Page, Route } from '@playwright/test'
import { createSeedState } from '../../src/domain/seed'
import type { AppState, Review } from '../../src/domain/types'
import type { WorkspaceRole } from '../../src/services/contracts'
import { defaultStages } from '../../src/features/crm/model'
import type { CrmDocument } from '../../src/features/crm/types'

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
  apiRequests: Array<{ method: string; path: string }>
  readonly state: AppState
  readonly revision: number
  stateWrites: AppState[]
  portalWrites: Array<Record<string, unknown>>
  reviewWrites: Array<Record<string, unknown>>
  cfpSubmissions: Array<Record<string, unknown>>
  claimRequests: Array<Record<string, unknown>>
  claimVerifications: string[]
  emailSends: Array<Record<string, unknown>>
  deliverableReminderSends: Array<Record<string, unknown>>
  reviewerInvitations: Array<Record<string, unknown>>
  speakerInvitations: Array<Record<string, unknown>>
  speakerInvitationLinks: string[]
  feedRequests: Array<{ method: string; format: string; filters: Record<string, string> }>
  readonly crm: CrmDocument
  readonly crmRevision: number
  crmWrites: CrmDocument[]
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
  let email = options.email ?? (role === 'reviewer' ? 'sarah@example.com' : role === 'speaker' ? 'priya@example.com' : 'owner@example.com')
  const stateWrites: AppState[] = []
  const apiRequests: Array<{ method: string; path: string }> = []
  const portalWrites: Array<Record<string, unknown>> = []
  const reviewWrites: Array<Record<string, unknown>> = []
  const cfpSubmissions: Array<Record<string, unknown>> = []
  const claimRequests: Array<Record<string, unknown>> = []
  const claimVerifications: string[] = []
  const emailSends: Array<Record<string, unknown>> = []
  const deliverableReminderSends: Array<Record<string, unknown>> = []
  const reviewerInvitations: Array<Record<string, unknown>> = []
  const speakerInvitations: Array<Record<string, unknown>> = []
  const speakerInvitationLinks: string[] = []
  const feedRequests: Array<{ method: string; format: string; filters: Record<string, string> }> = []
  let crmRevision = 1
  let crm: CrmDocument = {
    contacts: currentState.speakers.map((speaker) => ({
      id: `crm-${speaker.id}`, firstName: speaker.firstName, lastName: speaker.lastName, email: speaker.email, company: speaker.company, jobTitle: speaker.jobTitle, bio: speaker.bio,
      photoUrl: speaker.photoUrl, linkedinUrl: speaker.linkedinUrl, twitterUrl: speaker.twitterUrl, travelPreferences: speaker.travelPreferences,
      tags: [], customFields: {}, notes: [], activity: [{ id: `activity-${speaker.id}`, type: 'created', summary: 'Imported from event speaker.', createdAt: speaker.createdAt }],
      eventLinks: [{ eventId: currentState.event.id, eventName: currentState.event.name, speakerId: speaker.id, sessionTitles: currentState.submissions.filter((submission) => submission.speakerIds.includes(speaker.id)).map((submission) => submission.title), linkedAt: speaker.createdAt }],
      createdAt: speaker.createdAt, updatedAt: speaker.updatedAt,
    })),
    segments: [], stages: clone(defaultStages), pipeline: [], campaigns: [], updatedAt: currentState.lastUpdatedAt,
  }
  const crmWrites: CrmDocument[] = []
  let claimedEmail = ''
  let claimedPortalOnly = false
  const claimTokens = new Map<string, string>()
  const consumedClaimTokens = new Set<string>()

  const openRound = currentState.evaluationRounds?.find((round) => round.status === 'open')
  if (openRound) {
    openRound.opensAt = new Date(Date.now() - 86_400_000).toISOString()
    openRound.dueAt = new Date(Date.now() + 86_400_000).toISOString()
  }

  const control: ApiStubControl = {
    apiRequests,
    get state() { return currentState },
    get revision() { return revision },
    stateWrites,
    portalWrites,
    reviewWrites,
    cfpSubmissions,
    claimRequests,
    claimVerifications,
    emailSends,
    deliverableReminderSends,
    reviewerInvitations,
    speakerInvitations,
    speakerInvitationLinks,
    feedRequests,
    get crm() { return crm },
    get crmRevision() { return crmRevision },
    crmWrites,
    failNextStateWrite() { rejectNextStateWrite = true },
    failNextReviewWrite() { rejectNextReviewWrite = true },
  }

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    apiRequests.push({ method, path })

    if (options.hydrationFailure && path.endsWith('/session')) return error(route, 503, 'DATABASE_UNAVAILABLE', 'The shared workspace is temporarily unavailable.')

    if (path === '/api/health') return json(route, { data: { status: 'ok', database: 'ok', files: true, timestamp: new Date().toISOString() } })

    const feedMatch = path.match(/\/api\/public\/events\/[^/]+\/[^/]+\/feeds\/program\.(json|xml|ics)$/)
    if (feedMatch && (method === 'GET' || method === 'HEAD')) {
      const format = feedMatch[1]
      const filters = Object.fromEntries(['track', 'format', 'room'].flatMap((key) => url.searchParams.has(key) ? [[key, url.searchParams.get(key)!]] : []))
      feedRequests.push({ method, format, filters })
      const acceptedIds = new Set(currentState.submissions.filter((submission) => submission.status === 'accepted').map((submission) => submission.id))
      const sessions = currentState.sessions.filter((session) => session.published && acceptedIds.has(session.submissionId)).flatMap((session) => {
        const submission = currentState.submissions.find((item) => item.id === session.submissionId)
        if (!submission || (filters.track && submission.track !== filters.track) || (filters.format && submission.format !== filters.format) || (filters.room && session.room !== filters.room)) return []
        const speakers = currentState.speakers.filter((speaker) => submission.speakerIds.includes(speaker.id) && speaker.status === 'confirmed').map((speaker) => ({ id: speaker.id, name: `${speaker.firstName} ${speaker.lastName}`, company: speaker.company, jobTitle: speaker.jobTitle }))
        return [{ id: session.id, title: submission.title, description: submission.abstract, track: submission.track, format: submission.format, room: session.room, startAt: session.startAt, endAt: session.endAt, speakers }]
      })
      const etag = `"feed-${revision}-${format}-${JSON.stringify(filters)}"`
      const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60', ETag: etag }
      if (request.headers()['if-none-match'] === etag) return route.fulfill({ status: 304, headers })
      const bodies = {
        json: JSON.stringify({ event: { id: currentState.event.id, name: currentState.event.name, slug: currentState.event.slug }, revision, sessions }),
        xml: `<?xml version="1.0" encoding="UTF-8"?><program>${sessions.map((session) => `<session><title>${session.title.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</title></session>`).join('')}</program>`,
        ics: `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:PUBLISH\r\n${sessions.map((session) => `BEGIN:VEVENT\r\nUID:${currentState.event.id}-${session.id}@openspeaker.local\r\nSUMMARY:${session.title}\r\nLOCATION:${session.room}\r\nEND:VEVENT\r\n`).join('')}END:VCALENDAR\r\n`,
      }
      const contentTypes = { json: 'application/json; charset=utf-8', xml: 'application/xml; charset=utf-8', ics: 'text/calendar; charset=utf-8' }
      return route.fulfill({ status: 200, headers: { ...headers, 'Content-Type': contentTypes[format as keyof typeof contentTypes] }, body: method === 'HEAD' ? '' : bodies[format as keyof typeof bodies] })
    }

    if (/\/api\/public\/cfp\/[^/]+\/[^/]+\/claim$/.test(path)) {
      if (method === 'POST') {
        const input = request.postDataJSON() as Record<string, unknown>
        claimRequests.push(input)
        claimedEmail = String(input.email ?? '').toLowerCase()
        claimTokens.set('e2e-claim-token', claimedEmail)
        return json(route, { data: { status: 'pending' } }, 202)
      }
      if (method === 'GET') {
        const token = url.searchParams.get('token') ?? ''
        claimVerifications.push(token)
        const tokenEmail = claimTokens.get(token)
        if (!tokenEmail || consumedClaimTokens.has(token)) return error(route, 401, 'CFP_CLAIM_INVALID', 'This access link is invalid or expired.')
        consumedClaimTokens.add(token)
        email = tokenEmail
        claimedPortalOnly = true
        return json(route, { data: { claimed: true, eventId: currentState.event.id } })
      }
    }

    if (/\/api\/public\/cfp\/[^/]+\/[^/]+$/.test(path)) {
      if (method === 'GET') {
        const cfpState = publicProjection(currentState)
        cfpState.event = { ...cfpState.event, cfp: currentState.event.cfp }
        return json(route, { data: { event: { id: currentState.event.id, name: currentState.event.name, slug: currentState.event.slug }, config: currentState.event.cfp ?? {}, revision, state: cfpState } }, 200, { ETag: `"${revision}"` })
      }
      if (method === 'POST') {
        const input = request.postDataJSON() as Record<string, unknown>
        cfpSubmissions.push(input)
        const id = `submission-e2e-${cfpSubmissions.length}`
        const submittedAt = new Date().toISOString()
        const submittedEmail = String(input.speakerEmail ?? '').toLowerCase()
        let submittedSpeaker = currentState.speakers.find((speaker) => speaker.email.toLowerCase() === submittedEmail)
        if (!submittedSpeaker) {
          const [firstName = 'Speaker', ...lastName] = String(input.speakerName ?? 'Speaker').trim().split(/\s+/)
          submittedSpeaker = {
            ...currentState.speakers[0], id: `speaker-${id}`, firstName, lastName: lastName.join(' '), email: submittedEmail,
            company: String((input.speakerProfile as Record<string, unknown> | undefined)?.company ?? ''), jobTitle: String((input.speakerProfile as Record<string, unknown> | undefined)?.jobTitle ?? ''),
            bio: String((input.speakerProfile as Record<string, unknown> | undefined)?.bio ?? ''), status: 'invited', updatedAt: submittedAt,
          }
          currentState = { ...currentState, speakers: [...currentState.speakers, submittedSpeaker] }
        }
        const proposal = {
          ...currentState.submissions[0], id, title: String(input.title ?? ''), abstract: String(input.abstract ?? ''), track: String(input.track ?? 'General'),
          format: String(input.format ?? 'Talk'), durationMinutes: Number(input.durationMinutes ?? 30), speakerIds: [submittedSpeaker.id], status: 'needs-review' as const,
          origin: 'cfp' as const, customAnswers: (input.customAnswers ?? {}) as Record<string, string>, submittedAt, updatedAt: submittedAt,
        }
        currentState = { ...currentState, submissions: [...currentState.submissions, proposal] }
        revision += 1
        return json(route, { data: { id, status: 'needs-review', submittedAt } }, 201)
      }
    }

    if (/\/api\/public\/events\/[^/]+\/[^/]+\/state$/.test(path) && method === 'GET') {
      return json(route, { data: { event: { id: currentState.event.id, name: currentState.event.name, slug: currentState.event.slug }, revision, state: publicProjection(currentState), updatedAt: currentState.lastUpdatedAt } }, 200, { ETag: `"${revision}"` })
    }

    if (path.endsWith('/session') && method === 'GET') {
      if (claimedPortalOnly) return error(route, 401, 'AUTH_REQUIRED', 'Workspace authentication is required.')
      return json(route, { data: { user: { id: `user-${role}`, email, name: role === 'reviewer' ? 'Sarah Lin' : role === 'speaker' ? 'Priya Rao' : 'Release Owner' }, role } })
    }

    if (/\/api\/workspaces\/[^/]+\/events$/.test(path) && method === 'GET') {
      return json(route, { data: { events: [{ id: currentState.event.id, name: currentState.event.name, slug: currentState.event.slug, startAt: currentState.event.startAt, endAt: currentState.event.endAt, revision, createdAt: currentState.lastUpdatedAt, updatedAt: currentState.lastUpdatedAt }] } })
    }

    if (/\/api\/workspaces\/[^/]+\/crm\/integrations\/airtable$/.test(path) && method === 'GET') return json(route, { data: { configured: false } })

    if (/\/api\/workspaces\/[^/]+\/crm\/actions\/add-to-event$/.test(path) && method === 'POST') {
      const input = request.postDataJSON() as { contactId: string; eventId: string; expectedRevision: number }
      if (input.expectedRevision !== crmRevision) return error(route, 409, 'REVISION_CONFLICT', 'CRM changed before this action.')
      const contact = crm.contacts.find((item) => item.id === input.contactId)
      if (!contact || input.eventId !== currentState.event.id) return error(route, 404, 'CRM_CONTACT_OR_EVENT_NOT_FOUND', 'Contact or event not found.')
      const at = new Date().toISOString()
      const existingSpeaker = currentState.speakers.find((speaker) => speaker.email.toLowerCase() === contact.email.toLowerCase())
      const speakerId = existingSpeaker?.id ?? `speaker-${contact.id}`
      if (!existingSpeaker) currentState = { ...currentState, speakers: [...currentState.speakers, { id: speakerId, firstName: contact.firstName, lastName: contact.lastName, email: contact.email, company: contact.company, jobTitle: contact.jobTitle, bio: contact.bio, status: 'invited', availability: [], createdAt: at, updatedAt: at }] }
      crm = { ...crm, contacts: crm.contacts.map((item) => item.id === contact.id && !item.eventLinks.some((link) => link.eventId === input.eventId) ? { ...item, eventLinks: [...item.eventLinks, { eventId: input.eventId, eventName: currentState.event.name, speakerId, sessionTitles: [], linkedAt: at }], updatedAt: at } : item), updatedAt: at }
      crmRevision += 1
      crmWrites.push(clone(crm))
      return json(route, { data: { crm, revision: crmRevision } })
    }

    if (/\/api\/workspaces\/[^/]+\/crm$/.test(path)) {
      if (method === 'GET') return json(route, { data: { crm, revision: crmRevision } }, 200, { ETag: `"${crmRevision}"` })
      if (method === 'PUT') {
        const input = request.postDataJSON() as { expectedRevision: number; crm: CrmDocument }
        if (input.expectedRevision !== crmRevision) return error(route, 409, 'REVISION_CONFLICT', 'CRM changed before this update.')
        crm = clone(input.crm)
        crmRevision += 1
        crmWrites.push(clone(crm))
        return json(route, { data: { crm, revision: crmRevision } }, 200, { ETag: `"${crmRevision}"` })
      }
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
      if (assignments.length === 0 && claimedPortalOnly) return error(route, 403, 'ROLE_FORBIDDEN', 'No reviewer assignments exist for this event identity.')
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

    if (path.endsWith('/integrations/email/send') && method === 'POST') {
      const input = request.postDataJSON() as Record<string, unknown>
      emailSends.push(input)
      const messages = Array.isArray(input.messages) ? input.messages as Array<{ speakerId?: string }> : []
      return json(route, { data: { runId: `email-run-${emailSends.length}`, status: 'sent', replayed: false, result: { sent: messages.length, failed: 0, deliveries: messages.map((message, index) => ({ speakerId: message.speakerId ?? `speaker-${index}`, status: 'sent', providerMessageId: `provider-${index}` })) } } })
    }

    if (path.endsWith('/deliverables/reminders') && method === 'POST') {
      const input = request.postDataJSON() as Record<string, unknown>
      deliverableReminderSends.push(input)
      const taskIds = Array.isArray(input.taskIds) ? input.taskIds as string[] : []
      const tasks = currentState.tasks.filter((task) => taskIds.includes(task.id) && !task.completedAt)
      const speakerIds = [...new Set(tasks.map((task) => task.speakerId))]
      return json(route, { data: { runId: `deliverable-run-${deliverableReminderSends.length}`, status: 'sent', replayed: false, result: { requestedTasks: taskIds.length, recipients: speakerIds.length, sent: speakerIds.length, failed: 0, deliveries: speakerIds.map((speakerId, index) => ({ speakerId, status: 'sent', providerMessageId: `deliverable-provider-${index}`, taskIds: tasks.filter((task) => task.speakerId === speakerId).map((task) => task.id), calendarAttached: false })) } } })
    }

    if (path.endsWith('/reviewer-invitations') && method === 'POST') {
      const input = request.postDataJSON() as Record<string, unknown>
      reviewerInvitations.push(input)
      const targetEmail = String(input.email ?? '')
      const assignmentCount = (currentState.evaluationAssignments ?? []).filter((assignment) => assignment.reviewerEmail.toLowerCase() === targetEmail.toLowerCase()).length
      return json(route, { data: { invitationId: `reviewer-invite-${reviewerInvitations.length}`, email: targetEmail, status: 'sent', providerMessageId: 'reviewer-provider-1', expiresAt: new Date(Date.now() + 3_600_000).toISOString(), assignmentCount } }, 201)
    }

    if (path.endsWith('/speaker-invitations') && method === 'POST') {
      const input = request.postDataJSON() as Record<string, unknown>
      speakerInvitations.push(input)
      const speaker = currentState.speakers.find((item) => item.id === input.speakerId)
      const token = `e2e-speaker-invite-token-${String(speakerInvitations.length).padStart(16, '0')}`
      const targetEmail = speaker?.email.toLowerCase() ?? ''
      claimTokens.set(token, targetEmail)
      const link = new URL(String(input.returnUrl))
      link.searchParams.delete('cfpClaim')
      link.searchParams.set('claimToken', token)
      speakerInvitationLinks.push(link.toString())
      return json(route, { data: { invitationId: `speaker-invite-${speakerInvitations.length}`, email: speaker?.email ?? '', status: 'sent', providerMessageId: 'speaker-provider-1', expiresAt: new Date(Date.now() + 3_600_000).toISOString() } }, 201)
    }

    if (path.endsWith('/state/history') && method === 'GET') {
      return json(route, { data: { eventId: currentState.event.id, currentRevision: revision, revisions: [
        { revision, updated_by: 'user-owner', created_at: currentState.lastUpdatedAt, reason: 'current save', size_bytes: JSON.stringify(currentState).length },
        { revision: revision - 1, updated_by: 'user-owner', created_at: currentState.event.startAt, reason: 'program edit', size_bytes: JSON.stringify(currentState).length },
      ] } })
    }

    const revisionDetail = path.match(/\/state\/history\/(\d+)$/)
    if (revisionDetail && method === 'GET') return json(route, { data: { eventId: currentState.event.id, revision: Number(revisionDetail[1]), updatedBy: 'user-owner', createdAt: currentState.lastUpdatedAt, reason: 'program edit', state: currentState } })

    if (path.endsWith('/state/rollback') && method === 'POST') {
      const input = request.postDataJSON() as { expectedRevision: number; targetRevision: number }
      revision += 1
      return json(route, { data: { eventId: currentState.event.id, revision, rolledBackFrom: input.expectedRevision, targetRevision: input.targetRevision, updatedAt: new Date().toISOString() } })
    }

    if (path.endsWith('/integrations') && method === 'GET') return json(route, { data: { configured: { resend: false, accelevents: false }, runs: [], deliveries: [] } })
    if (path.endsWith('/members') && method === 'GET') return json(route, { data: [] })
    if (path.endsWith('/audit') && method === 'GET') return json(route, { data: [] })

    return error(route, 404, 'API_ROUTE_NOT_FOUND', `No E2E stub exists for ${method} ${path}.`)
  })

  return control
}
