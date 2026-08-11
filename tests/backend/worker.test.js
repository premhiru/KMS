import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { ApiError, EVENT_STATE_UPSERT_SQL, SCHEMA_STATEMENTS, extractForwardedIdentity, fetchHandler, mergePublicSubmissionsIntoState, sanitizePublicState, validateCfpSubmission, validateStateWrite } from '../../worker/index.js'

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

afterEach(() => vi.unstubAllGlobals())

describe('backend contract validation', () => {
  it('accepts and normalizes a valid public CFP submission', () => {
    expect(validateCfpSubmission({
      title: 'A dependable agent architecture',
      abstract: 'A detailed walkthrough of recovery, tracing, and human escalation patterns.',
      speakerName: 'Maya Chen', speakerEmail: 'MAYA@EXAMPLE.COM', track: 'Agents', format: 'Talk', consent: true,
    }, { tracks: ['Agents'], formats: ['Talk'] })).toMatchObject({ speakerEmail: 'maya@example.com', consent: true })
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
    expect(validateStateWrite({ expectedRevision: 0, event: { name: 'AI Summit', slug: 'ai-summit', cfpOpen: true }, state: { schemaVersion: 1 } })).toMatchObject({ expectedRevision: 0, event: { slug: 'ai-summit' } })
    expect(() => validateStateWrite({ expectedRevision: -1, event: {}, state: {} })).toThrowError(ApiError)
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
    const seedState = { schemaVersion: 1, lastUpdatedAt: '2026-01-01T00:00:00Z', event: { id: 'event-1' }, speakers: [], submissions: [], reviews: [], tasks: [], sessions: [], templates: [], communicationLog: [] }
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
    const closedSeed = await fetchHandler(new Request(closedEndpoint, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ expectedRevision: 0, event: { name: 'Closed CFP', slug: 'closed', cfpOpen: true, cfpConfig: { closeAt: '2020-01-01T00:00:00Z' } }, state: { ...seedState, event: { id: 'event-closed' } } }) }), env)
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
    const state = {
      schemaVersion: 1, lastUpdatedAt: '2026-01-01T00:00:00Z',
      event: { id: 'event-secure', name: 'Secure Summit', resources: [{ id: 'resource-1', title: 'Speaker guide', audience: 'speakers', url: 'https://example.com/guide' }] },
      speakers: [
        { id: 'speaker-own', firstName: 'Speaker', lastName: 'One', email: 'speaker@example.com', company: '', jobTitle: '', bio: '', status: 'confirmed', availability: [], createdAt: 'now', updatedAt: 'now' },
        { id: 'speaker-other', firstName: 'Private', lastName: 'Person', email: 'private@example.com', company: '', jobTitle: '', bio: '', status: 'confirmed', availability: [], createdAt: 'now', updatedAt: 'now' },
      ],
      submissions: [
        { id: 'submission-own', title: 'Blind proposal', abstract: 'Private abstract', track: 'AI', format: 'Talk', durationMinutes: 30, speakerIds: ['speaker-own'], status: 'accepted', tags: [], createdAt: 'now', updatedAt: 'now' },
        { id: 'submission-other', title: 'Unassigned proposal', abstract: 'Must remain hidden', track: 'AI', format: 'Talk', durationMinutes: 30, speakerIds: ['speaker-other'], status: 'accepted', tags: [], createdAt: 'now', updatedAt: 'now' },
      ],
      tasks: [{ id: 'task-own', speakerId: 'speaker-own', kind: 'profile', title: 'Profile', dueAt: '2026-01-01', updatedAt: 'now' }, { id: 'task-other', speakerId: 'speaker-other', kind: 'profile', title: 'Other', dueAt: '2026-01-01', updatedAt: 'now' }],
      sessions: [], reviews: [], templates: [], communicationLog: [],
      evaluationRounds: [{ id: 'round-blind', name: 'Blind round', status: 'open', opensAt: '2020-01-01T00:00:00Z', dueAt: '2099-01-01T00:00:00Z', blind: true, rubric: [{ id: 'relevance', maxScore: 5 }] }],
      evaluationAssignments: [
        { id: 'assignment-own', submissionId: 'submission-own', reviewerEmail: 'reviewer@example.com', status: 'assigned', roundId: 'round-blind' },
        { id: 'assignment-other', submissionId: 'submission-other', reviewerEmail: 'other-reviewer@example.com', status: 'assigned', blind: false },
      ],
    }
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
      expect(payload.attachments[0]).toMatchObject({ filename: 'session.ics', content_type: 'text/calendar; charset=utf-8' })
      expect(atob(payload.attachments[0].content)).toContain('BEGIN:VCALENDAR')
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

  it('keeps each prepared migration as a single SQL statement', () => {
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
