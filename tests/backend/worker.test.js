import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { ApiError, EVENT_STATE_UPSERT_SQL, MIGRATION_VERSIONS, SCHEMA_STATEMENTS, extractForwardedIdentity, fetchHandler, mergePublicSubmissionsIntoState, sanitizePublicState, scheduledHandler, validateAppStateDocument, validateCfpSubmission, validateStateWrite } from '../../worker/index.js'
import { createSeedState } from '../../src/domain/seed'

class D1StatementMock {
  constructor(database, sql, params = []) { this.database = database; this.sql = sql; this.params = params }
  bind(...params) { return new D1StatementMock(this.database, this.sql, params) }
  async first() { return this.database.prepare(this.sql).get(...this.params) ?? null }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.params) } }
  async run() {
    if (/\bRETURNING\b/i.test(this.sql)) return { success: true, results: this.database.prepare(this.sql).all(...this.params) }
    const result = this.database.prepare(this.sql).run(...this.params)
    return { success: true, results: [], meta: { changes: Number(result.changes) } }
  }
}

class D1Mock {
  constructor() { this.database = new DatabaseSync(':memory:') }
  prepare(sql) { return new D1StatementMock(this.database, sql) }
  async batch(statements) {
    this.database.exec('BEGIN')
    try {
      const results = []
      for (const statement of statements) results.push(await statement.run())
      this.database.exec('COMMIT')
      return results
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}

class R2Mock {
  constructor() { this.objects = new Map() }
  async put(key, bytes) { this.objects.set(key, bytes.slice(0)) }
  async get(key) {
    const body = this.objects.get(key)
    return body ? { body, httpEtag: `"${body.byteLength}"` } : null
  }
  async delete(key) { this.objects.delete(key) }
}

afterEach(() => vi.unstubAllGlobals())

function validAppState(eventId = 'event-1', overrides = {}) {
  const timestamp = '2026-01-01T00:00:00.000Z'
  const base = {
    schemaVersion: 1,
    lastUpdatedAt: timestamp,
    event: {
      id: eventId, name: 'AI Summit', slug: eventId, venue: 'Convention Center', timezone: 'UTC',
      startAt: '2026-09-01T09:00:00.000Z', endAt: '2026-09-01T18:00:00.000Z', rooms: ['Main'], tracks: ['AI'],
    },
    speakers: [], submissions: [], reviews: [], evaluationPlans: [], evaluationRounds: [], evaluationAssignments: [], evaluationAdvancements: [],
    tasks: [], sessions: [], templates: [], communicationLog: [],
  }
  return { ...base, ...overrides, event: { ...base.event, ...(overrides.event || {}) } }
}

describe('backend contract validation', () => {
  it('accepts and normalizes a valid public CFP submission', () => {
    expect(validateCfpSubmission({
      title: 'A dependable agent architecture',
      abstract: 'A detailed walkthrough of recovery, tracing, and human escalation patterns.',
      speakerName: 'Maya Chen', speakerEmail: 'MAYA@EXAMPLE.COM', track: 'Agents', format: 'Talk', consent: true,
    }, { tracks: ['Agents'], formats: ['Talk'] })).toMatchObject({ speakerEmail: 'maya@example.com', consent: true })
  })

  it('enforces configured category routing instead of trusting applicant track and format', () => {
    const input = { title: 'A routed proposal title', abstract: 'A sufficiently detailed abstract for the routed proposal validation test.', speakerName: 'Route Speaker', speakerEmail: 'route@example.com', category: 'research', track: 'Applicant override', format: 'Applicant override', consent: true }
    const config = { tracks: ['Evaluation'], formats: ['Talk'], routingRules: [{ id: 'route-research', category: 'research', track: 'Evaluation', format: 'Talk', enabled: true }] }
    expect(validateCfpSubmission(input, config)).toMatchObject({ category: 'research', track: 'Evaluation', format: 'Talk' })
    expect(() => validateCfpSubmission({ ...input, category: 'unknown' }, config)).toThrowError(expect.objectContaining({ code: 'INVALID_CFP_CATEGORY' }))
  })

  it('returns a structured validation error for missing consent', () => {
    expect(() => validateCfpSubmission({
      title: 'A dependable agent architecture', abstract: 'A detailed walkthrough of recovery, tracing, and escalation patterns.',
      speakerName: 'Maya Chen', speakerEmail: 'maya@example.com', consent: false,
    })).toThrowError(ApiError)
    try {
      validateCfpSubmission({ title: 'A valid proposal title', abstract: 'Long enough abstract for server-side validation and testing.', speakerName: 'Maya Chen', speakerEmail: 'maya@example.com', consent: false })
    } catch (error) {
      expect(error).toMatchObject({ status: 422, code: 'CONSENT_REQUIRED' })
    }
  })

  it('requires an optimistic revision and URL-safe event metadata', () => {
    expect(validateStateWrite({ expectedRevision: 0, event: { name: 'AI Summit', slug: 'ai-summit', cfpOpen: true }, state: validAppState('event-1', { event: { name: 'AI Summit', slug: 'ai-summit' } }) })).toMatchObject({ expectedRevision: 0, event: { slug: 'ai-summit' } })
    expect(() => validateStateWrite({ expectedRevision: -1, event: {}, state: {} })).toThrowError(ApiError)
  })

  it('rejects malformed relationships and unsupported AppState schemas', () => {
    const state = validAppState('event-strict', {
      schemaVersion: 2,
      submissions: [{ id: 'submission-bad', title: 'Bad relation', abstract: 'Still a complete proposal', track: 'AI', format: 'Talk', durationMinutes: 30, speakerIds: ['missing-speaker'], status: 'accepted', tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    })
    expect(() => validateAppStateDocument(state, 'event-strict')).toThrowError(expect.objectContaining({ code: 'INVALID_APP_STATE', status: 422 }))
  })

  it('accepts the current frontend seed as the canonical AppState schema', () => {
    const state = createSeedState()
    expect(validateAppStateDocument(state, state.event.id)).toBe(state)
  })
})

describe('trusted forwarded identity', () => {
  it('uses canonical Sites authentication headers and decodes the full name', () => {
    const request = new Request('https://example.test/api', { headers: {
      'oai-authenticated-user-id': 'user-123',
      'oai-authenticated-user-email': 'owner@example.com',
      'oai-authenticated-user-full-name': 'Sarah%20Lin',
      'oai-authenticated-user-full-name-encoding': 'percent-encoded',
    } })
    expect(extractForwardedIdentity(request, {})).toEqual({ id: 'user-123', email: 'owner@example.com', name: 'Sarah Lin' })
  })

  it('rejects x-* aliases unless local auth is explicitly enabled in the environment', () => {
    const request = new Request('http://localhost/api', { headers: { 'x-openai-user-id': 'user-123', 'x-openai-user-email': 'owner@example.com' } })
    expect(() => extractForwardedIdentity(request, {})).toThrowError(ApiError)
    expect(extractForwardedIdentity(request, { ALLOW_LOCAL_AUTH: 'true' })).toMatchObject({ id: 'user-123' })
  })
})

describe('public state projection', () => {
  it('includes only published accepted sessions and removes private operational data', () => {
    const state = {
      schemaVersion: 1, lastUpdatedAt: '2026-01-01T00:00:00Z', event: { id: 'event-1', cfp: { private: true }, resources: [{ private: true }] },
      speakers: [{ id: 'speaker-1', firstName: 'Maya', lastName: 'Chen', email: 'private@example.com', status: 'confirmed', bio: 'Bio' }, { id: 'speaker-2', firstName: 'Not', lastName: 'Published', status: 'confirmed' }],
      submissions: [{ id: 'accepted', status: 'accepted', speakerIds: ['speaker-1'] }, { id: 'declined', status: 'declined', speakerIds: ['speaker-2'] }],
      sessions: [{ id: 'session-1', submissionId: 'accepted', published: true }, { id: 'session-2', submissionId: 'declined', published: true }],
      reviews: [{ private: true }], tasks: [{ private: true }], templates: [{ private: true }], communicationLog: [{ private: true }],
    }
    const result = sanitizePublicState(state)
    expect(result.sessions).toHaveLength(1)
    expect(result.submissions).toHaveLength(1)
    expect(result.speakers).toEqual([expect.objectContaining({ id: 'speaker-1', email: '', availability: [] })])
    expect(result.event).not.toHaveProperty('cfp')
    expect(result.event).not.toHaveProperty('resources')
    expect(result.reviews).toEqual([])
    expect(result.communicationLog).toEqual([])
  })

  it('merges a source proposal deterministically without duplicating speakers or submissions', () => {
    const state = { schemaVersion: 1, lastUpdatedAt: '2026-01-01', event: {}, speakers: [], submissions: [] }
    const rows = [{ id: 'source-1', title: 'Proposal', abstract: 'Abstract', speaker_name: 'Maya Chen', speaker_email: 'maya@example.com', track: 'AI', format: 'Talk', status: 'needs-review', payload_json: JSON.stringify({ customAnswers: { level: 'advanced' }, coSpeakers: [{ name: 'Owen Wallace', email: 'owen@example.com' }] }), created_at: '2026-02-01', updated_at: '2026-02-01' }]
    const first = mergePublicSubmissionsIntoState(state, rows)
    const second = mergePublicSubmissionsIntoState(first.state, rows)
    expect(first.importedCount).toBe(1)
    expect(second.importedCount).toBe(0)
    expect(second.state.submissions).toHaveLength(1)
    expect(second.state.speakers).toHaveLength(2)
    expect(second.state.submissions[0]).toMatchObject({ sourceSubmissionId: 'source-1', customAnswers: { level: 'advanced' } })
    const tombstoned = mergePublicSubmissionsIntoState({ ...state, deletedSourceSubmissionIds: ['source-1'] }, rows)
    expect(tombstoned.importedCount).toBe(0)
    expect(tombstoned.state.submissions).toEqual([])
  })
})

describe('public CFP to organizer state lifecycle', () => {
  it('seeds state, accepts an anonymous submission, and returns it exactly once on repeated authenticated reads', async () => {
    const DB = new D1Mock()
    const env = { DB, CFP_RATE_LIMIT: '20', ALLOW_LOCAL_AUTH: 'true' }
    const authHeaders = {
      'content-type': 'application/json',
      'oai-authenticated-user-id': 'user-owner',
      'oai-authenticated-user-email': 'owner@example.com',
      'oai-authenticated-user-full-name': 'Owner%20User',
    }
    const endpoint = 'https://app.test/api/workspaces/workspace-1/events/event-1/state'
    const seedState = validAppState('event-1', { event: { name: 'Summit', slug: 'summit' } })
    const seedResponse = await fetchHandler(new Request(endpoint, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ expectedRevision: 0, event: { name: 'Summit', slug: 'summit', cfpOpen: true, cfpConfig: { tracks: ['AI'], formats: ['Talk'], allowMultiple: true, submissionLimit: 2, questions: [{ id: 'experience', required: true, conditions: [{ field: 'track', equals: 'AI' }] }] } }, state: seedState }) }), env)
    expect(seedResponse.status).toBe(201)

    const proposal = {
      title: 'Reliable AI systems in practice', abstract: 'A practical guide to recovery, observability, evaluation, and safe human escalation.',
      speakerName: 'Maya Chen', speakerEmail: 'maya@example.com', track: 'AI', format: 'Talk', consent: true,
      customAnswers: { experience: 'advanced' }, coSpeakers: [{ name: 'Owen Wallace', email: 'owen@example.com', company: 'Northstar' }],
    }
    const missingRequired = await fetchHandler(new Request('https://app.test/api/public/cfp/workspace-1/summit', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' }, body: JSON.stringify({ ...proposal, customAnswers: {} }) }), env)
    expect(missingRequired.status).toBe(422)
    expect((await missingRequired.json()).error.code).toBe('REQUIRED_QUESTION_MISSING')
    const submissionResponse = await fetchHandler(new Request('https://app.test/api/public/cfp/workspace-1/summit', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' }, body: JSON.stringify(proposal) }), env)
    expect(submissionResponse.status).toBe(201)
    const secondSubmission = await fetchHandler(new Request('https://app.test/api/public/cfp/workspace-1/summit', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' }, body: JSON.stringify({ ...proposal, title: 'A second valid AI proposal' }) }), env)
    expect(secondSubmission.status).toBe(201)
    const overLimit = await fetchHandler(new Request('https://app.test/api/public/cfp/workspace-1/summit', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' }, body: JSON.stringify({ ...proposal, title: 'A third proposal over the limit' }) }), env)
    expect(overLimit.status).toBe(409)
    expect((await overLimit.json()).error.code).toBe('SUBMISSION_LIMIT_REACHED')

    const firstRead = await fetchHandler(new Request(endpoint, { headers: authHeaders }), env)
    const firstPayload = await firstRead.json()
    const secondRead = await fetchHandler(new Request(endpoint, { headers: authHeaders }), env)
    const secondPayload = await secondRead.json()
    expect(firstRead.status).toBe(200)
    expect(firstPayload.data.state.submissions).toHaveLength(2)
    expect(firstPayload.data.state.speakers).toHaveLength(2)
    expect(firstPayload.data.state.submissions[0]).toMatchObject({ source: 'public-cfp', customAnswers: { experience: 'advanced' } })
    expect(secondPayload.data.state.submissions).toHaveLength(2)
    expect(new Set(secondPayload.data.state.submissions.map((submission) => submission.sourceSubmissionId)).size).toBe(2)

    const closedEndpoint = 'https://app.test/api/workspaces/workspace-1/events/event-closed/state'
    const closedSeed = await fetchHandler(new Request(closedEndpoint, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ expectedRevision: 0, event: { name: 'Closed CFP', slug: 'closed', cfpOpen: true, cfpConfig: { closeAt: '2020-01-01T00:00:00Z' } }, state: validAppState('event-closed', { event: { name: 'Closed CFP', slug: 'closed' } }) }) }), env)
    expect(closedSeed.status).toBe(201)
    const closedSubmission = await fetchHandler(new Request('https://app.test/api/public/cfp/workspace-1/closed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(proposal) }), env)
    expect(closedSubmission.status).toBe(410)
    expect((await closedSubmission.json()).error.code).toBe('CFP_CLOSED')
    DB.database.close()
  })
})

describe('speaker, reviewer, and integration boundaries', () => {
  it('claims a matched speaker, isolates blind reviewers, and sends an idempotent ICS email', async () => {
    const DB = new D1Mock()
    const env = { DB, RESEND_API_KEY: 'resend-test', EMAIL_FROM: 'Summit <events@example.com>', ALLOW_LOCAL_AUTH: 'true' }
    const ownerHeaders = { 'content-type': 'application/json', 'oai-authenticated-user-id': 'owner-1', 'oai-authenticated-user-email': 'owner@example.com' }
    const eventEndpoint = 'https://app.test/api/workspaces/workspace-secure/events/event-secure/state'
    const state = validAppState('event-secure', {
      schemaVersion: 1, lastUpdatedAt: '2026-01-01T00:00:00Z',
      event: { name: 'Secure Summit', slug: 'secure', resources: [{ id: 'resource-1', title: 'Speaker guide', body: 'Approved guidance', approvalStatus: 'approved', version: 1, updatedAt: '2026-01-01T00:00:00.000Z', files: [] }] },
      speakers: [
        { id: 'speaker-own', firstName: 'Speaker', lastName: 'One', email: 'speaker@example.com', company: '', jobTitle: '', bio: '', status: 'confirmed', availability: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'speaker-other', firstName: 'Private', lastName: 'Person', email: 'private@example.com', company: '', jobTitle: '', bio: '', status: 'confirmed', availability: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
      submissions: [
        { id: 'submission-own', title: 'Blind proposal', abstract: 'Private abstract', track: 'AI', format: 'Talk', durationMinutes: 30, speakerIds: ['speaker-own'], status: 'accepted', tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'submission-other', title: 'Unassigned proposal', abstract: 'Must remain hidden', track: 'AI', format: 'Talk', durationMinutes: 30, speakerIds: ['speaker-other'], status: 'accepted', tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
      tasks: [{ id: 'task-own', speakerId: 'speaker-own', kind: 'profile', title: 'Profile', dueAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }, { id: 'task-other', speakerId: 'speaker-other', kind: 'profile', title: 'Other', dueAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      sessions: [{ id: 'session-own', submissionId: 'submission-own', room: 'Main', startAt: '2026-09-01T10:00:00.000Z', endAt: '2026-09-01T10:30:00.000Z', published: true, updatedAt: '2026-02-01T00:00:00.000Z' }], reviews: [], templates: [], communicationLog: [],
      evaluationPlans: [{ id: 'plan-secure', name: 'Secure review', instructions: 'Review carefully', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      evaluationRounds: [{ id: 'round-blind', planId: 'plan-secure', name: 'Blind round', position: 1, status: 'open', opensAt: '2020-01-01T00:00:00Z', dueAt: '2099-01-01T00:00:00Z', blind: true, instructions: 'Blind review', rubric: [{ id: 'relevance', label: 'Relevance', weight: 1, maxScore: 5 }], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      evaluationAssignments: [
        { id: 'assignment-own', submissionId: 'submission-own', reviewerEmail: 'reviewer@example.com', status: 'assigned', roundId: 'round-blind' },
        { id: 'assignment-other', submissionId: 'submission-other', reviewerEmail: 'other-reviewer@example.com', status: 'assigned', roundId: 'round-blind', blind: false },
      ],
    })
    expect((await fetchHandler(new Request(eventEndpoint, { method: 'PUT', headers: ownerHeaders, body: JSON.stringify({ expectedRevision: 0, event: { name: 'Secure Summit', slug: 'secure', cfpOpen: false, cfpConfig: {} }, state }) }), env)).status).toBe(201)
    const membersEndpoint = 'https://app.test/api/workspaces/workspace-secure/members'
    for (const member of [{ userId: 'reviewer-1', email: 'reviewer@example.com', role: 'reviewer' }]) {
      expect((await fetchHandler(new Request(membersEndpoint, { method: 'POST', headers: ownerHeaders, body: JSON.stringify(member) }), env)).status).toBe(201)
    }
    const rejectedOrigin = await fetchHandler(new Request(membersEndpoint, { method: 'POST', headers: { ...ownerHeaders, origin: 'https://evil.example' }, body: JSON.stringify({ userId: 'evil', email: 'evil@example.com', role: 'speaker' }) }), env)
    expect(rejectedOrigin.status).toBe(403)
    expect((await rejectedOrigin.json()).error.code).toBe('ORIGIN_FORBIDDEN')

    const speakerHeaders = { 'content-type': 'application/json', 'oai-authenticated-user-id': 'speaker-user', 'oai-authenticated-user-email': 'speaker@example.com' }
    const portalEndpoint = 'https://app.test/api/workspaces/workspace-secure/events/event-secure/speaker-portal'
    const portalResponse = await fetchHandler(new Request(portalEndpoint, { headers: speakerHeaders }), env)
    const portal = await portalResponse.json()
    expect(portalResponse.status).toBe(200)
    expect(portal.data.portal.speaker.id).toBe('speaker-own')
    expect(portal.data.portal.tasks.map((task) => task.id)).toEqual(['task-own'])
    expect(portal.data.portal.resources.map((resource) => resource.id)).toEqual(['resource-1'])
    expect(portal.data.portal).not.toHaveProperty('reviews')
    const sessionResponse = await fetchHandler(new Request('https://app.test/api/workspaces/workspace-secure/session', { headers: speakerHeaders }), env)
    expect(await sessionResponse.json()).toMatchObject({ data: { user: { email: 'speaker@example.com' }, role: 'speaker' } })
    const forbiddenTask = await fetchHandler(new Request(portalEndpoint, { method: 'PATCH', headers: speakerHeaders, body: JSON.stringify({ expectedRevision: 1, taskUpdates: [{ id: 'task-other', completed: true }] }) }), env)
    expect(forbiddenTask.status).toBe(403)
    const portalUpdate = await fetchHandler(new Request(portalEndpoint, { method: 'PATCH', headers: speakerHeaders, body: JSON.stringify({ expectedRevision: 1, profile: { bio: 'Updated own biography' }, taskUpdates: [{ id: 'task-own', completed: true }] }) }), env)
    expect(portalUpdate.status).toBe(200)
    expect((await portalUpdate.json()).data.revision).toBe(2)

    const reviewerHeaders = { 'content-type': 'application/json', 'oai-authenticated-user-id': 'reviewer-1', 'oai-authenticated-user-email': 'reviewer@example.com' }
    const queueResponse = await fetchHandler(new Request('https://app.test/api/workspaces/workspace-secure/events/event-secure/reviewer-queue', { headers: reviewerHeaders }), env)
    const queue = await queueResponse.json()
    expect(queue.data.submissions.map((submission) => submission.id)).toEqual(['submission-own'])
    expect(queue.data.submissions[0].speakerIds).toEqual([])
    expect(queue.data.speakers).toEqual([])
    expect(queue.data.rounds[0].opensAt).toBe('2020-01-01T00:00:00Z')
    const fullStateDenied = await fetchHandler(new Request(eventEndpoint, { headers: reviewerHeaders }), env)
    expect(fullStateDenied.status).toBe(403)
    const submissionsDenied = await fetchHandler(new Request('https://app.test/api/workspaces/workspace-secure/events/event-secure/submissions', { headers: reviewerHeaders }), env)
    expect(submissionsDenied.status).toBe(403)
    const reviewEndpoint = 'https://app.test/api/workspaces/workspace-secure/events/event-secure/reviews'
    const crossReview = await fetchHandler(new Request(reviewEndpoint, { method: 'POST', headers: reviewerHeaders, body: JSON.stringify({ expectedRevision: 2, assignmentId: 'assignment-other', submissionId: 'submission-other', review: { scores: { relevance: 5 } } }) }), env)
    expect(crossReview.status).toBe(403)
    const ownReview = await fetchHandler(new Request(reviewEndpoint, { method: 'POST', headers: reviewerHeaders, body: JSON.stringify({ expectedRevision: 2, assignmentId: 'assignment-own', submissionId: 'submission-own', review: { scores: { relevance: 5 }, note: 'Strong' }, assignmentStatus: 'completed' }) }), env)
    expect(ownReview.status).toBe(200)
    const abstainedReview = await fetchHandler(new Request(reviewEndpoint, { method: 'POST', headers: reviewerHeaders, body: JSON.stringify({ expectedRevision: 3, assignmentId: 'assignment-own', submissionId: 'submission-own', review: { scores: { relevance: 5 }, note: 'Conflict' }, assignmentStatus: 'abstained', abstain: true }) }), env)
    expect(abstainedReview.status).toBe(200)
    const ownerRead = await fetchHandler(new Request(eventEndpoint, { headers: ownerHeaders }), env)
    const ownerPayload = await ownerRead.json()
    expect(ownerPayload.data.state.reviews).toEqual([])
    const closedState = { ...ownerPayload.data.state, evaluationRounds: ownerPayload.data.state.evaluationRounds.map((round) => ({ ...round, status: 'closed' })) }
    const closeRound = await fetchHandler(new Request(eventEndpoint, { method: 'PUT', headers: ownerHeaders, body: JSON.stringify({ expectedRevision: ownerPayload.data.revision, event: { name: 'Secure Summit', slug: 'secure', cfpOpen: false, cfpConfig: {} }, state: closedState }) }), env)
    expect(closeRound.status).toBe(200)
    const closedRoundReview = await fetchHandler(new Request(reviewEndpoint, { method: 'POST', headers: reviewerHeaders, body: JSON.stringify({ expectedRevision: ownerPayload.data.revision + 1, assignmentId: 'assignment-own', submissionId: 'submission-own', review: { scores: { relevance: 5 }, note: 'Too late' }, assignmentStatus: 'completed' }) }), env)
    expect(closedRoundReview.status).toBe(409)
    expect((await closedRoundReview.json()).error.code).toBe('REVIEW_ROUND_CLOSED')

    const providerFetch = vi.fn(async (_url, options) => {
      const payload = JSON.parse(options.body)
      expect(payload.attachments[0]).toMatchObject({ filename: 'session.ics', content_type: 'text/calendar; method=REQUEST; charset=utf-8' })
      const calendar = atob(payload.attachments[0].content)
      expect(calendar).toContain('METHOD:REQUEST')
      expect(calendar).toContain('UID:event-secure-session-own@openspeaker.local')
      expect(calendar).toContain('ATTENDEE;CN=Speaker One;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:speaker@example.com')
      return new Response(JSON.stringify({ id: 'email-provider-1' }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', providerFetch)
    const emailEndpoint = 'https://app.test/api/workspaces/workspace-secure/events/event-secure/integrations/email/send'
    const emailBody = { idempotencyKey: 'calendar-send-001', messages: [{ speakerId: 'speaker-own', subject: 'Your calendar', text: 'Attached', attachment: { filename: 'session.ics', type: 'text/calendar', content: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n' } }] }
    const sent = await fetchHandler(new Request(emailEndpoint, { method: 'POST', headers: ownerHeaders, body: JSON.stringify(emailBody) }), env)
    expect(sent.status).toBe(200)
    const replay = await fetchHandler(new Request(emailEndpoint, { method: 'POST', headers: ownerHeaders, body: JSON.stringify(emailBody) }), env)
    expect((await replay.json()).data.replayed).toBe(true)
    expect(providerFetch).toHaveBeenCalledTimes(1)
    DB.database.close()
  })
})

describe('production operations', () => {
  it('keeps recoverable state history and rolls back as a new optimistic revision', async () => {
    const DB = new D1Mock()
    const env = { DB, ALLOW_LOCAL_AUTH: 'true' }
    const headers = { 'content-type': 'application/json', 'oai-authenticated-user-id': 'owner-history', 'oai-authenticated-user-email': 'history@example.com' }
    const endpoint = 'https://app.test/api/workspaces/workspace-history/events/event-history/state'
    const first = validAppState('event-history', { event: { name: 'First name', slug: 'history' } })
    expect((await fetchHandler(new Request(endpoint, { method: 'PUT', headers, body: JSON.stringify({ expectedRevision: 0, event: { name: 'First name', slug: 'history', cfpOpen: false, cfpConfig: {} }, state: first }) }), env)).status).toBe(201)
    const second = { ...first, lastUpdatedAt: '2026-02-01T00:00:00.000Z', event: { ...first.event, name: 'Second name' } }
    expect((await fetchHandler(new Request(endpoint, { method: 'PUT', headers, body: JSON.stringify({ expectedRevision: 1, event: { name: 'Second name', slug: 'history', cfpOpen: false, cfpConfig: {} }, state: second }) }), env)).status).toBe(200)
    const history = await (await fetchHandler(new Request(`${endpoint}/history`, { headers }), env)).json()
    expect(history.data.revisions.map((item) => item.revision)).toEqual([2, 1])
    const revisionOne = await (await fetchHandler(new Request(`${endpoint}/history/1`, { headers }), env)).json()
    expect(revisionOne.data.state.event.name).toBe('First name')
    const rollback = await fetchHandler(new Request(`${endpoint}/rollback`, { method: 'POST', headers, body: JSON.stringify({ expectedRevision: 2, targetRevision: 1, reason: 'Operator recovery test' }) }), env)
    expect(rollback.status).toBe(200)
    expect(await rollback.json()).toMatchObject({ data: { revision: 3, targetRevision: 1 } })
    expect(await (await fetchHandler(new Request(endpoint, { headers }), env)).json()).toMatchObject({ data: { revision: 3, state: { event: { name: 'First name' } } } })
    DB.database.close()
  })

  it('rejects a concurrent duplicate integration while its lease is active', async () => {
    const DB = new D1Mock()
    const env = { DB, RESEND_API_KEY: 'resend-concurrency', EMAIL_FROM: 'Summit <events@example.com>', ALLOW_LOCAL_AUTH: 'true' }
    const headers = { 'content-type': 'application/json', 'oai-authenticated-user-id': 'owner-concurrency', 'oai-authenticated-user-email': 'concurrency@example.com' }
    const speaker = { id: 'speaker-concurrency', firstName: 'Concurrent', lastName: 'Speaker', email: 'speaker@example.com', company: '', jobTitle: '', bio: '', status: 'confirmed', availability: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    const state = validAppState('event-concurrency', { event: { name: 'Concurrency Summit', slug: 'concurrency' }, speakers: [speaker] })
    const endpoint = 'https://app.test/api/workspaces/workspace-concurrency/events/event-concurrency'
    expect((await fetchHandler(new Request(`${endpoint}/state`, { method: 'PUT', headers, body: JSON.stringify({ expectedRevision: 0, event: { name: state.event.name, slug: state.event.slug, cfpOpen: false, cfpConfig: {} }, state }) }), env)).status).toBe(201)
    let releaseFirstProvider
    let signalProviderStarted
    const providerStarted = new Promise((resolve) => { signalProviderStarted = resolve })
    let providerCalls = 0
    vi.stubGlobal('fetch', vi.fn(() => {
      providerCalls += 1
      signalProviderStarted()
      if (providerCalls > 1) return Promise.resolve(new Response(JSON.stringify({ id: 'provider-recovered' }), { status: 200 }))
      return new Promise((resolve) => { releaseFirstProvider = () => resolve(new Response(JSON.stringify({ id: 'provider-concurrent' }), { status: 200 })) })
    }))
    const body = JSON.stringify({ idempotencyKey: 'concurrent-send-001', messages: [{ speakerId: speaker.id, subject: 'Hello', text: 'Message' }] })
    const first = fetchHandler(new Request(`${endpoint}/integrations/email/send`, { method: 'POST', headers, body }), env)
    await providerStarted
    const duplicate = await fetchHandler(new Request(`${endpoint}/integrations/email/send`, { method: 'POST', headers, body }), env)
    expect(duplicate.status).toBe(409)
    expect((await duplicate.json()).error.code).toBe('INTEGRATION_IN_PROGRESS')
    DB.database.prepare(`UPDATE integration_leases SET lease_expires_at='2000-01-01T00:00:00.000Z'`).run()
    const recovered = await fetchHandler(new Request(`${endpoint}/integrations/email/send`, { method: 'POST', headers, body }), env)
    expect(recovered.status).toBe(200)
    expect(providerCalls).toBe(2)
    releaseFirstProvider()
    expect((await first).status).toBe(409)
    const mismatched = await fetchHandler(new Request(`${endpoint}/integrations/email/send`, { method: 'POST', headers, body: JSON.stringify({ idempotencyKey: 'concurrent-send-001', messages: [{ speakerId: speaker.id, subject: 'Changed payload', text: 'Different' }] }) }), env)
    expect(mismatched.status).toBe(409)
    expect((await mismatched.json()).error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH')
    DB.database.close()
  })

  it('enforces event-scoped asset access, signatures, and per-user quotas', async () => {
    const DB = new D1Mock()
    const FILES = new R2Mock()
    const env = { DB, FILES, ALLOW_LOCAL_AUTH: 'true', MAX_ASSET_BYTES: '1024', MAX_USER_EVENT_ASSET_BYTES: '1024' }
    const ownerHeaders = { 'content-type': 'application/json', 'oai-authenticated-user-id': 'owner-files', 'oai-authenticated-user-email': 'owner-files@example.com' }
    const speaker = { id: 'speaker-files', firstName: 'File', lastName: 'Speaker', email: 'speaker-files@example.com', company: '', jobTitle: '', bio: '', status: 'confirmed', availability: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    for (const [eventId, slug, speakers] of [['event-files', 'files', [speaker]], ['event-other', 'other', []]]) {
      const state = validAppState(eventId, { event: { name: `Event ${slug}`, slug }, speakers })
      const response = await fetchHandler(new Request(`https://app.test/api/workspaces/workspace-files/events/${eventId}/state`, { method: 'PUT', headers: ownerHeaders, body: JSON.stringify({ expectedRevision: 0, event: { name: state.event.name, slug, cfpOpen: false, cfpConfig: {} }, state }) }), env)
      expect(response.status).toBe(201)
    }
    const speakerHeaders = { 'oai-authenticated-user-id': 'speaker-files-user', 'oai-authenticated-user-email': 'speaker-files@example.com' }
    expect((await fetchHandler(new Request('https://app.test/api/workspaces/workspace-files/events/event-files/speaker-portal', { headers: speakerHeaders }), env)).status).toBe(200)
    const png = new Uint8Array(700)
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const uploadHeaders = { ...speakerHeaders, 'content-type': 'image/png', 'x-file-name': 'headshot.png' }
    const firstUpload = await fetchHandler(new Request('https://app.test/api/workspaces/workspace-files/events/event-files/assets', { method: 'POST', headers: uploadHeaders, body: png }), env)
    expect(firstUpload.status).toBe(201)
    const quotaExceeded = await fetchHandler(new Request('https://app.test/api/workspaces/workspace-files/events/event-files/assets', { method: 'POST', headers: uploadHeaders, body: png }), env)
    expect(quotaExceeded.status).toBe(413)
    expect((await quotaExceeded.json()).error.code).toBe('USER_STORAGE_QUOTA_EXCEEDED')
    const wrongEvent = await fetchHandler(new Request('https://app.test/api/workspaces/workspace-files/events/event-other/assets', { method: 'POST', headers: uploadHeaders, body: png }), env)
    expect(wrongEvent.status).toBe(403)
    const badSignature = await fetchHandler(new Request('https://app.test/api/workspaces/workspace-files/events/event-files/assets', { method: 'POST', headers: uploadHeaders, body: new Uint8Array(16) }), { ...env, MAX_USER_EVENT_ASSET_BYTES: '5000' })
    expect(badSignature.status).toBe(415)
    const expandedEnv = { ...env, MAX_USER_EVENT_ASSET_BYTES: '5000' }
    expect((await fetchHandler(new Request('https://app.test/api/workspaces/workspace-files/events/event-files/assets', { method: 'POST', headers: { ...speakerHeaders, 'content-type': 'text/plain', 'x-file-name': 'notes.txt' }, body: new TextEncoder().encode('Speaker notes') }), expandedEnv)).status).toBe(201)
    expect((await fetchHandler(new Request('https://app.test/api/workspaces/workspace-files/events/event-files/assets', { method: 'POST', headers: { ...speakerHeaders, 'content-type': 'text/plain', 'x-file-name': 'binary.txt' }, body: new Uint8Array([65, 0, 66]) }), expandedEnv)).status).toBe(415)
    expect((await fetchHandler(new Request('https://app.test/api/workspaces/workspace-files/events/event-files/assets', { method: 'POST', headers: { ...speakerHeaders, 'content-type': 'application/msword', 'x-file-name': 'proposal.doc' }, body: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) }), expandedEnv)).status).toBe(201)
    expect((await fetchHandler(new Request('https://app.test/api/workspaces/workspace-files/events/event-files/assets', { method: 'POST', headers: { ...speakerHeaders, 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'x-file-name': 'proposal.docx' }, body: new Uint8Array([0x50, 0x4b, 0x03, 0x04]) }), expandedEnv)).status).toBe(201)
    DB.database.close()
  })

  it('publishes only an approved completed headshot through the scoped anonymous image route', async () => {
    const DB = new D1Mock()
    const FILES = new R2Mock()
    const env = { DB, FILES, ALLOW_LOCAL_AUTH: 'true' }
    const headers = { 'content-type': 'application/json', 'oai-authenticated-user-id': 'owner-headshot', 'oai-authenticated-user-email': 'headshot-owner@example.com' }
    const speaker = { id: 'speaker-headshot', firstName: 'Public', lastName: 'Speaker', email: 'public@example.com', company: '', jobTitle: '', bio: '', photoUrl: 'javascript:alert(1)', status: 'confirmed', availability: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    const submission = { id: 'submission-headshot', title: 'Public talk', abstract: 'A public accepted session abstract.', track: 'AI', format: 'Talk', durationMinutes: 30, speakerIds: [speaker.id], status: 'accepted', tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    const state = validAppState('event-headshot', { event: { name: 'Headshot Summit', slug: 'headshot' }, speakers: [speaker], submissions: [submission], sessions: [{ id: 'session-headshot', submissionId: submission.id, room: 'Main', startAt: '2026-09-01T10:00:00.000Z', endAt: '2026-09-01T10:30:00.000Z', published: true, updatedAt: '2026-01-01T00:00:00.000Z' }], tasks: [{ id: 'task-headshot', speakerId: speaker.id, kind: 'headshot', title: 'Headshot', dueAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-02T00:00:00.000Z', approvalStatus: 'approved', asset: { id: 'asset-headshot', name: 'headshot.png', type: 'image/png', size: 16, selectedAt: '2026-01-02T00:00:00.000Z' }, updatedAt: '2026-01-02T00:00:00.000Z' }] })
    const endpoint = 'https://app.test/api/workspaces/workspace-headshot/events/event-headshot/state'
    expect((await fetchHandler(new Request(endpoint, { method: 'PUT', headers, body: JSON.stringify({ expectedRevision: 0, event: { name: state.event.name, slug: state.event.slug, cfpOpen: false, cfpConfig: {} }, state }) }), env)).status).toBe(201)
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
    await FILES.put('workspace-headshot/event-headshot/asset-headshot-headshot.png', png)
    DB.database.prepare(`INSERT INTO assets (id,workspace_id,event_id,object_key,file_name,content_type,size_bytes,uploaded_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)`).run('asset-headshot', 'workspace-headshot', 'event-headshot', 'workspace-headshot/event-headshot/asset-headshot-headshot.png', 'headshot.png', 'image/png', png.byteLength, 'owner-headshot', '2026-01-02T00:00:00.000Z')
    const publicPayload = await (await fetchHandler(new Request('https://app.test/api/public/events/workspace-headshot/headshot/state'), env)).json()
    expect(publicPayload.data.state.speakers[0].photoUrl).toBe('/api/public/events/workspace-headshot/headshot/speakers/speaker-headshot/headshot')
    const image = await fetchHandler(new Request('https://app.test/api/public/events/workspace-headshot/headshot/speakers/speaker-headshot/headshot'), env)
    expect(image.status).toBe(200)
    expect(image.headers.get('cache-control')).toBe('public, max-age=300')
    expect(image.headers.get('content-disposition')).toContain('inline')
    expect((await fetchHandler(new Request('https://app.test/api/public/events/workspace-headshot/headshot/speakers/speaker-private/headshot'), env)).status).toBe(404)
    DB.database.close()
  })

  it('runs durable reminders once per schedule bucket and exposes scheduled/status history', async () => {
    const DB = new D1Mock()
    const env = { DB, RESEND_API_KEY: 'resend-reminders', EMAIL_FROM: 'Summit <events@example.com>', CRON_SECRET: 'a-very-long-maintenance-secret-value', ALLOW_LOCAL_AUTH: 'true' }
    const headers = { 'content-type': 'application/json', 'oai-authenticated-user-id': 'owner-reminders', 'oai-authenticated-user-email': 'reminders@example.com' }
    const speaker = { id: 'speaker-reminder', firstName: 'Rina', lastName: 'Li', email: 'rina@example.com', company: '', jobTitle: '', bio: '', status: 'confirmed', availability: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    const submission = { id: 'submission-reminder', title: 'Reminder session', abstract: 'Calendar-scoped reminder session.', track: 'AI', format: 'Talk', durationMinutes: 30, speakerIds: [speaker.id], status: 'accepted', tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    const state = validAppState('event-reminders', {
      event: { name: 'Reminder Summit', slug: 'reminders', reminderSchedules: [{ id: 'schedule-daily', name: 'Daily onboarding', templateId: 'template-reminder', audience: 'incomplete-onboarding', enabled: true, cadence: 'daily', daysBeforeDue: 3, timezone: 'UTC', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }] },
      speakers: [speaker], tasks: [{ id: 'task-reminder', speakerId: speaker.id, kind: 'profile', title: 'Complete profile', dueAt: '2026-02-02T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      submissions: [submission], sessions: [{ id: 'session-reminder', submissionId: submission.id, room: 'Main', startAt: '2026-09-01T10:00:00.000Z', endAt: '2026-09-01T10:30:00.000Z', published: true, updatedAt: '2026-02-01T00:00:00.000Z' }],
      templates: [{ id: 'template-reminder', name: 'Reminder', subject: '{{task.title}} for {{event.name}}', body: 'Hi {{speaker.firstName}}, due {{task.dueAt}}', audience: 'incomplete-onboarding', enabled: true, updatedAt: '2026-01-01T00:00:00.000Z' }],
    })
    const endpoint = 'https://app.test/api/workspaces/workspace-reminders/events/event-reminders'
    expect((await fetchHandler(new Request(`${endpoint}/state`, { method: 'PUT', headers, body: JSON.stringify({ expectedRevision: 0, event: { name: state.event.name, slug: state.event.slug, cfpOpen: false, cfpConfig: {} }, state }) }), env)).status).toBe(201)
    const providerFetch = vi.fn(async (_url, options) => {
      const payload = JSON.parse(options.body)
      expect(payload).toMatchObject({ to: ['rina@example.com'], subject: 'Complete profile for Reminder Summit', attachments: [expect.objectContaining({ content_type: 'text/calendar; method=REQUEST; charset=utf-8' })] })
      const calendar = atob(payload.attachments[0].content)
      expect(calendar).toContain('METHOD:REQUEST')
      expect(calendar).toMatch(/UID:event-reminders(?:-two)?-session-reminder@openspeaker\.local/)
      expect(calendar).toContain('ATTENDEE;CN=Rina Li;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:rina@example.com')
      return new Response(JSON.stringify({ id: 'reminder-provider-1' }), { status: 200 })
    })
    vi.stubGlobal('fetch', providerFetch)
    const runBody = JSON.stringify({ at: '2026-02-01T12:00:00.000Z', idempotencyKey: 'reminder-run-001' })
    expect((await fetchHandler(new Request(`${endpoint}/reminders/run`, { method: 'POST', headers, body: runBody }), env)).status).toBe(200)
    expect((await fetchHandler(new Request(`${endpoint}/reminders/run`, { method: 'POST', headers, body: runBody }), env)).status).toBe(200)
    expect(providerFetch).toHaveBeenCalledTimes(1)
    const secondState = { ...state, event: { ...state.event, id: 'event-reminders-two', slug: 'reminders-two' } }
    const secondEndpoint = 'https://app.test/api/workspaces/workspace-reminders-two/events/event-reminders-two'
    expect((await fetchHandler(new Request(`${secondEndpoint}/state`, { method: 'PUT', headers, body: JSON.stringify({ expectedRevision: 0, event: { name: secondState.event.name, slug: secondState.event.slug, cfpOpen: false, cfpConfig: {} }, state: secondState }) }), env)).status).toBe(201)
    expect((await fetchHandler(new Request(`${secondEndpoint}/reminders/run`, { method: 'POST', headers, body: runBody }), env)).status).toBe(200)
    expect(providerFetch).toHaveBeenCalledTimes(2)
    expect(DB.database.prepare(`SELECT COUNT(*) AS count FROM automation_runs WHERE kind='reminders'`).get().count).toBe(2)
    const stale = DB.database.prepare(`SELECT id FROM automation_runs WHERE workspace_id=? AND event_id=? AND kind='reminders'`).get('workspace-reminders', 'event-reminders')
    DB.database.prepare(`UPDATE automation_runs SET status='running',result_json='{}',completed_at=NULL WHERE id=?`).run(stale.id)
    DB.database.prepare(`INSERT INTO automation_leases (run_id,lease_token,lease_expires_at,attempt_count,updated_at) VALUES (?,?,?,?,?)`).run(stale.id, 'expired-token', '2000-01-01T00:00:00.000Z', 1, '2000-01-01T00:00:00.000Z')
    const resumed = await fetchHandler(new Request(`${endpoint}/reminders/run`, { method: 'POST', headers, body: runBody }), env)
    expect(await resumed.json()).toMatchObject({ data: { status: 'succeeded', replayed: false, result: { resumed: true } } })
    expect(providerFetch).toHaveBeenCalledTimes(2)
    const status = await (await fetchHandler(new Request(`${endpoint}/reminders`, { headers }), env)).json()
    expect(status.data).toMatchObject({ configured: true, runs: [expect.objectContaining({ status: 'succeeded' })], deliveries: [expect.objectContaining({ status: 'sent' })] })
    const scheduled = await scheduledHandler({ scheduledTime: Date.parse('2026-02-01T12:30:00.000Z') }, env, { waitUntil: () => {} })
    expect(scheduled.reminderRuns[0].result.skipped).toBe(1)
    const denied = await fetchHandler(new Request('https://app.test/api/internal/maintenance', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer wrong-secret' }, body: '{}' }), env)
    expect(denied.status).toBe(401)
    DB.database.close()
  })

  it('makes maintenance fail visibly when due reminders are unconfigured or delivery fails', async () => {
    const DB = new D1Mock()
    const baseEnv = { DB, CRON_SECRET: 'a-very-long-maintenance-secret-value', ALLOW_LOCAL_AUTH: 'true' }
    const headers = { 'content-type': 'application/json', 'oai-authenticated-user-id': 'owner-maintenance', 'oai-authenticated-user-email': 'maintenance@example.com' }
    const speaker = { id: 'speaker-maintenance', firstName: 'Due', lastName: 'Speaker', email: 'due@example.com', company: '', jobTitle: '', bio: '', status: 'confirmed', availability: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    const state = validAppState('event-maintenance', {
      event: { name: 'Maintenance Summit', slug: 'maintenance', reminderSchedules: [{ id: 'schedule-maintenance', name: 'Due reminder', templateId: 'template-maintenance', audience: 'overdue-tasks', enabled: true, cadence: 'daily', timezone: 'UTC', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }] },
      speakers: [speaker], tasks: [{ id: 'task-maintenance', speakerId: speaker.id, kind: 'profile', title: 'Due task', dueAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      templates: [{ id: 'template-maintenance', name: 'Due', subject: 'Due', body: 'Please complete', audience: 'overdue-tasks', enabled: true, updatedAt: '2026-01-01T00:00:00.000Z' }],
    })
    const endpoint = 'https://app.test/api/workspaces/workspace-maintenance/events/event-maintenance/state'
    expect((await fetchHandler(new Request(endpoint, { method: 'PUT', headers, body: JSON.stringify({ expectedRevision: 0, event: { name: state.event.name, slug: state.event.slug, cfpOpen: false, cfpConfig: {} }, state }) }), baseEnv)).status).toBe(201)
    const maintenanceRequest = () => new Request('https://app.test/api/internal/maintenance', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${baseEnv.CRON_SECRET}` }, body: JSON.stringify({ at: '2026-02-01T12:00:00.000Z' }) })
    const unconfigured = await fetchHandler(maintenanceRequest(), baseEnv)
    expect(unconfigured.status).toBe(503)
    expect(await unconfigured.json()).toMatchObject({ data: { ok: false, remindersConfigured: false, failureCount: 1 } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'provider down' }), { status: 500 })))
    const failed = await fetchHandler(maintenanceRequest(), { ...baseEnv, RESEND_API_KEY: 'resend', EMAIL_FROM: 'Events <events@example.com>' })
    expect(failed.status).toBe(502)
    expect(await failed.json()).toMatchObject({ data: { ok: false, remindersConfigured: true, failureCount: 1 } })
    DB.database.close()
  })

  it('uses the native Accelevents Key API with durable create/update mappings', async () => {
    const DB = new D1Mock()
    const env = { DB, ACCELEVENTS_API_KEY: 'accelevents-key', ACCELEVENTS_EVENT_URL: 'native-summit', ALLOW_LOCAL_AUTH: 'true' }
    const headers = { 'content-type': 'application/json', 'oai-authenticated-user-id': 'owner-native', 'oai-authenticated-user-email': 'native@example.com' }
    const speaker = { id: 'speaker-native', firstName: 'Nia', lastName: 'Ray', email: 'nia@example.com', company: 'Signal', jobTitle: 'Engineer', bio: 'Bio', status: 'confirmed', availability: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    const submission = { id: 'submission-native', title: 'Native API', abstract: 'Native provider mapping', track: 'AI', format: 'Workshop', durationMinutes: 60, speakerIds: [speaker.id], status: 'accepted', tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    const state = validAppState('event-native', {
      event: { name: 'Native Summit', slug: 'native', timezone: 'UTC', accelevents: { sessionTitle: 'title', description: 'abstract', track: 'track', type: 'format', location: 'room', speakers: 'speakers', includeOnlyConfirmedSpeakers: true, includeOnlyPublishedSessions: true } },
      speakers: [speaker], submissions: [submission], sessions: [{ id: 'session-native', submissionId: submission.id, room: 'Main', startAt: '2026-09-01T10:00:00.000Z', endAt: '2026-09-01T11:00:00.000Z', published: true, updatedAt: '2026-01-01T00:00:00.000Z' }],
    })
    const endpoint = 'https://app.test/api/workspaces/workspace-native/events/event-native'
    expect((await fetchHandler(new Request(`${endpoint}/state`, { method: 'PUT', headers, body: JSON.stringify({ expectedRevision: 0, event: { name: state.event.name, slug: state.event.slug, cfpOpen: false, cfpConfig: {} }, state }) }), env)).status).toBe(201)
    const providerFetch = vi.fn(async (url, options) => {
      expect(options.headers.Key).toBe('accelevents-key')
      if (String(url).endsWith('/speaker')) return new Response(JSON.stringify({ id: 101 }), { status: 201 })
      const body = JSON.parse(options.body)
      expect(body).toMatchObject({ title: 'Native API', startTime: '2026/09/01 10:00', format: 'WORKSHOP', speakerIds: ['101'] })
      return new Response(JSON.stringify({ id: 202 }), { status: 201 })
    })
    vi.stubGlobal('fetch', providerFetch)
    const syncBody = JSON.stringify({ idempotencyKey: 'native-sync-001' })
    const synced = await fetchHandler(new Request(`${endpoint}/integrations/accelevents/sync`, { method: 'POST', headers, body: syncBody }), env)
    expect(synced.status).toBe(200)
    expect(providerFetch.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.accelevents.com/rest/host/event/native-summit/speaker',
      'https://api.accelevents.com/rest/host/event/native-summit/session',
    ])
    expect((await fetchHandler(new Request(`${endpoint}/integrations/accelevents/sync`, { method: 'POST', headers, body: syncBody }), env)).status).toBe(200)
    expect(providerFetch).toHaveBeenCalledTimes(2)
    const status = await (await fetchHandler(new Request(`${endpoint}/integrations`, { headers }), env)).json()
    expect(status.data.mappings).toEqual(expect.arrayContaining([expect.objectContaining({ object_type: 'speaker', remote_id: '101' }), expect.objectContaining({ object_type: 'session', remote_id: '202' })]))
    DB.database.close()
  })
})

describe('D1 initialization', () => {
  it('does not let an arbitrary first authenticated caller claim an uninitialized workspace', async () => {
    const DB = new D1Mock()
    const response = await fetchHandler(new Request('https://app.test/api/workspaces/workspace-uninitialized/events/event-1/state', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'oai-authenticated-user-id': 'attacker-1',
        'oai-authenticated-user-email': 'attacker@example.com',
      },
      body: JSON.stringify({ expectedRevision: 0, event: { name: 'Claimed', slug: 'claimed', cfpOpen: false }, state: { schemaVersion: 1, event: {}, speakers: [], submissions: [] } }),
    }), { DB })
    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe('WORKSPACE_NOT_INITIALIZED')
    DB.database.close()
  })

  it('bootstraps the configured forwarded email when the access-account ID namespace differs', async () => {
    const DB = new D1Mock()
    const env = { DB, BOOTSTRAP_OWNER_EMAIL: 'configured@example.com', BOOTSTRAP_OWNER_ID: 'access-account-id-that-is-not-forwarded' }
    const state = validAppState('event-email-bootstrap', { event: { name: 'Email Bootstrap', slug: 'email-bootstrap' } })
    const response = await fetchHandler(new Request('https://app.test/api/workspaces/workspace-email-bootstrap/events/event-email-bootstrap/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'oai-authenticated-user-id': 'forwarded-user-namespace-id', 'oai-authenticated-user-email': 'CONFIGURED@example.com' },
      body: JSON.stringify({ expectedRevision: 0, event: { name: state.event.name, slug: state.event.slug, cfpOpen: false, cfpConfig: {} }, state }),
    }), env)
    expect(response.status).toBe(201)
    expect(DB.database.prepare(`SELECT role FROM memberships WHERE workspace_id=? AND user_id=?`).get('workspace-email-bootstrap', 'forwarded-user-namespace-id')).toEqual({ role: 'owner' })
    DB.database.close()
  })

  it('repairs only the exact configured owner membership on an existing workspace', async () => {
    const DB = new D1Mock()
    await fetchHandler(new Request('https://app.test/api/health'), { DB })
    DB.database.prepare(`INSERT INTO workspaces (id,name,created_at) VALUES (?,?,?)`).run('workspace-repair', 'Repair workspace', '2026-01-01T00:00:00.000Z')
    const env = { DB, BOOTSTRAP_OWNER_ID: 'access-account-owner-id', BOOTSTRAP_OWNER_EMAIL: 'configured@example.com' }
    const owner = await fetchHandler(new Request('https://app.test/api/workspaces/workspace-repair/session', { headers: { 'oai-authenticated-user-id': 'forwarded-owner-id', 'oai-authenticated-user-email': 'configured@example.com' } }), env)
    expect(owner.status).toBe(200)
    expect(await owner.json()).toMatchObject({ data: { role: 'owner', user: { id: 'forwarded-owner-id', email: 'configured@example.com' } } })
    const stranger = await fetchHandler(new Request('https://app.test/api/workspaces/workspace-repair/session', { headers: { 'oai-authenticated-user-id': 'stranger-user', 'oai-authenticated-user-email': 'stranger@example.com' } }), env)
    expect(stranger.status).toBe(403)
    DB.database.close()
  })

  it('keeps each prepared migration as a single SQL statement', () => {
    expect(MIGRATION_VERSIONS).toEqual(['0001_initial', '0002_integrations', '0003_operations', '0004_automation_scopes'])
    expect(SCHEMA_STATEMENTS.length).toBeGreaterThan(8)
    for (const statement of SCHEMA_STATEMENTS) {
      expect(statement.trim()).not.toContain(';')
      expect(statement).toMatch(/^(CREATE TABLE|CREATE INDEX)/)
    }
  })

  it('creates revision one, increments a matching revision, and rejects a stale writer', () => {
    const database = new DatabaseSync(':memory:')
    for (const statement of SCHEMA_STATEMENTS) database.exec(statement)
    database.prepare(`INSERT INTO users (id,email,name,created_at,updated_at) VALUES (?,?,?,?,?)`).run('user-1', 'owner@example.com', 'Owner', 'now', 'now')
    database.prepare(`INSERT INTO workspaces (id,name,created_at) VALUES (?,?,?)`).run('workspace-1', 'Workspace', 'now')
    database.prepare(`INSERT INTO events (id,workspace_id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?,?)`).run('event-1', 'workspace-1', 'Event', 'event', 'now', 'now')
    const statement = database.prepare(EVENT_STATE_UPSERT_SQL)
    expect(statement.all('event-1', '{"step":1}', 'user-1', 'now', 0, 'event-1', 0, 'event-1', 'workspace-1', 0)).toEqual([{ revision: 1 }])
    expect(statement.all('event-1', '{"step":2}', 'user-1', 'now', 1, 'event-1', 1, 'event-1', 'workspace-1', 1)).toEqual([{ revision: 2 }])
    expect(statement.all('event-1', '{"stale":true}', 'user-1', 'now', 1, 'event-1', 1, 'event-1', 'workspace-1', 1)).toEqual([])
    expect(statement.all('event-1', '{"crossTenant":true}', 'user-1', 'now', 2, 'event-1', 2, 'event-1', 'workspace-2', 2)).toEqual([])
    expect(database.prepare(`SELECT revision,state_json FROM event_states WHERE event_id=?`).get('event-1')).toEqual({ revision: 2, state_json: '{"step":2}' })
    database.close()
  })
})
