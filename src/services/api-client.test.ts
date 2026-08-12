import { describe, expect, it, vi } from 'vitest'
import { createSeedState } from '../domain'
import { OpenSpeakerApiClient } from './api-client'
import { ApiError } from './api-error'
import { LocalAppStateAdapter } from './local-adapter'

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(data), { ...init, headers })
}

function client(fetcher: typeof fetch, extra: Record<string, unknown> = {}) {
  return new OpenSpeakerApiClient({
    baseUrl: 'https://api.example.test/', workspaceId: 'workspace-main', eventId: 'event-summit', eventSlug: 'summit-2026', fetch: fetcher,
    requestId: () => 'client-request', retryBaseDelayMs: 0, ...extra,
  })
}

function serverState() {
  const state = createSeedState()
  return { data: { event: { id: 'event-summit', name: state.event.name, slug: state.event.slug, cfpOpen: true, cfpConfig: state.event.cfp ?? {} }, revision: 3, state, updatedAt: state.lastUpdatedAt } }
}

describe('shipped Worker contract', () => {
  it('GETs scoped state, validates the data envelope, and checks ETag', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json(serverState(), { headers: { etag: '"3"', 'x-request-id': 'server-request' } }))
    const result = await client(fetcher).getState()
    expect(result.revision).toBe(3)
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('https://api.example.test/api/workspaces/workspace-main/events/event-summit/state')
    expect(new Headers(init?.headers).get('x-request-id')).toBe('client-request')
    expect(init?.credentials).toBe('include')
  })

  it('PUTs the exact seed/update body with numeric revision and If-Match', async () => {
    const state = createSeedState()
    const fetcher = vi.fn<typeof fetch>(async () => json({ data: { eventId: 'event-summit', revision: 1, updatedAt: state.lastUpdatedAt } }, { status: 201, headers: { etag: '"1"' } }))
    const result = await client(fetcher).putState(state, { revision: 0 })
    expect(result.revision).toBe(1)
    const [, init] = fetcher.mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(init?.method).toBe('PUT')
    expect(new Headers(init?.headers).get('if-match')).toBe('"0"')
    expect(body).toMatchObject({ expectedRevision: 0, event: { name: state.event.name, slug: state.event.slug, cfpOpen: state.event.cfp?.open } })
    expect(body.state).toEqual(JSON.parse(JSON.stringify(state)))
  })

  it('uses the exact public CFP and published-event routes and payloads', async () => {
    const state = createSeedState()
    const publicState = structuredClone(state)
    publicState.speakers.forEach((speaker) => { speaker.email = '' })
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: { event: { id: 'event-summit', name: 'Summit', slug: 'summit-2026' }, config: {}, revision: 3, state: publicState } }))
      .mockResolvedValueOnce(json({ data: { id: 'submission-1', status: 'needs-review', submittedAt: state.lastUpdatedAt } }, { status: 201 }))
      .mockResolvedValueOnce(json({ data: { event: { id: 'event-summit', name: 'Summit', slug: 'summit-2026' }, revision: 3, state: publicState, updatedAt: state.lastUpdatedAt } }, { headers: { etag: '"3"' } }))
    const api = client(fetcher)
    await api.getPublicCfp()
    const input = { title: 'Reliable systems', abstract: 'A production-tested approach to building reliable agent systems.', speakerName: 'Ada Lovelace', speakerEmail: 'ada@example.test', consent: true as const }
    await api.submitCfp(input)
    await api.getPublicEvent()
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.test/api/public/cfp/workspace-main/summit-2026',
      'https://api.example.test/api/public/cfp/workspace-main/summit-2026',
      'https://api.example.test/api/public/events/workspace-main/summit-2026/state',
    ])
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual(input)
  })

  it('uploads raw file bytes with Worker headers and downloads private bytes', async () => {
    const file = new File(['slides'], 'deck.pdf', { type: 'application/pdf' })
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: { id: 'asset-1', fileName: 'deck.pdf', contentType: 'application/pdf', sizeBytes: 6, createdAt: '2026-08-11T00:00:00Z' } }, { status: 201 }))
      .mockResolvedValueOnce(new Response('slides', { headers: { 'content-type': 'application/pdf', 'content-length': '6', 'content-disposition': 'attachment; filename="deck.pdf"', etag: 'file-tag' } }))
    const api = client(fetcher)
    await api.uploadAsset(file)
    const downloaded = await api.downloadAsset('asset-1')
    const uploadInit = fetcher.mock.calls[0][1]
    expect(uploadInit?.body).toBe(file)
    expect(new Headers(uploadInit?.headers).get('x-file-name')).toBe('deck.pdf')
    expect(new Headers(uploadInit?.headers).get('content-type')).toBe('application/pdf')
    expect(downloaded).toMatchObject({ fileName: 'deck.pdf', contentType: 'application/pdf', sizeBytes: 6, etag: 'file-tag' })
  })

  it('maps members and audit snake_case responses', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: [{ id: 'user-1', email: 'owner@example.test', name: 'Owner', role: 'owner', created_at: '2026-08-11T00:00:00Z' }] }))
      .mockResolvedValueOnce(json({ data: [{ id: 'audit-1', actor_user_id: 'user-1', action: 'event.state.updated', entity_type: 'event', entity_id: 'event-summit', request_id: 'request-1', created_at: '2026-08-11T00:00:00Z', metadata: { revision: 2 } }] }))
    const api = client(fetcher)
    await expect(api.getMembers()).resolves.toMatchObject([{ id: 'user-1', role: 'owner', createdAt: '2026-08-11T00:00:00Z' }])
    await expect(api.getAudit()).resolves.toMatchObject([{ actorUserId: 'user-1', entityType: 'event', requestId: 'request-1' }])
  })
})

describe('transport and local adapter', () => {
  it('retries safe GETs but never retries CFP POST', async () => {
    const health = { data: { status: 'ok', database: 'ok', files: true, timestamp: '2026-08-11T00:00:00Z' } }
    const getFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ error: { code: 'BUSY', message: 'later' } }, { status: 503 })).mockResolvedValueOnce(json(health))
    await expect(client(getFetch).getHealth()).resolves.toMatchObject({ status: 'ok', files: true })
    expect(getFetch).toHaveBeenCalledTimes(2)
    const postFetch = vi.fn<typeof fetch>().mockResolvedValue(json({ error: { code: 'RATE_LIMITED', message: 'later', requestId: 'server-id' } }, { status: 429 }))
    await expect(client(postFetch).submitCfp({ title: 'Title', abstract: 'Long enough proposal abstract text.', speakerName: 'Ada', speakerEmail: 'ada@example.test', consent: true })).rejects.toMatchObject({ code: 'RATE_LIMITED', requestId: 'client-request' })
    expect(postFetch).toHaveBeenCalledTimes(1)
  })

  it('loads the hosting identity and workspace role from the scoped session route', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ data: { user: { id: 'user-1', email: 'owner@example.test', name: 'Owner' }, role: 'owner' } }))
    await expect(client(fetcher).getSession()).resolves.toEqual({ user: { id: 'user-1', email: 'owner@example.test', name: 'Owner' }, role: 'owner' })
    expect(fetcher.mock.calls[0][0]).toBe('https://api.example.test/api/workspaces/workspace-main/session')
  })

  it('implements the same numeric revision contract locally', async () => {
    let current = createSeedState()
    const adapter = new LocalAppStateAdapter({ read: () => current, replace: (state) => { current = state } })
    const loaded = await adapter.getState()
    const saved = await adapter.putState({ ...loaded.state, lastUpdatedAt: '2026-08-11T12:00:00Z' }, { revision: 0 })
    expect(saved.revision).toBe(1)
    const error = await adapter.putState(saved.state, { revision: 0 }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'REVISION_CONFLICT', status: 409 })
  })
})

describe('integration and speaker portal contract', () => {
  it('reads configured providers and normalizes run and delivery logs', async () => {
    const response = { data: {
      configured: { resend: true, accelevents: false },
      runs: [{ id: 'run-1', provider: 'resend', action: 'email.send', idempotency_key: 'campaign-001', status: 'sent', response: { sent: 1 }, error_code: null, error_message: null, started_by: 'user-1', created_at: '2026-08-11T00:00:00Z', completed_at: '2026-08-11T00:01:00Z' }],
      deliveries: [{ id: 'delivery-1', run_id: 'run-1', idempotency_key: 'campaign-001:0', recipient_speaker_id: 'speaker-maya', recipient_email: 'maya@example.test', subject: 'Welcome', provider_message_id: 'email-1', status: 'sent', error_message: null, created_at: '2026-08-11T00:00:00Z', updated_at: '2026-08-11T00:01:00Z' }],
    } }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(response)).mockResolvedValueOnce(json(response))
    const api = client(fetcher)
    const status = await api.getIntegrationStatus()
    expect(status).toMatchObject({ configured: { resend: true, accelevents: false }, runs: [{ idempotencyKey: 'campaign-001', startedBy: 'user-1' }], deliveries: [{ runId: 'run-1', recipientSpeakerId: 'speaker-maya' }] })
    await expect(api.getIntegrationLogs()).resolves.toMatchObject({ runs: [{ id: 'run-1' }], deliveries: [{ id: 'delivery-1' }] })
    expect(fetcher.mock.calls[0][0]).toBe('https://api.example.test/api/workspaces/workspace-main/events/event-summit/integrations')
  })

  it('sends personalized email and syncs Accelevents with exact idempotency payloads', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: { runId: 'run-email', status: 'sent', replayed: false, result: { sent: 1, failed: 0, deliveries: [{ speakerId: 'speaker-maya', deliveryId: 'delivery-1', status: 'sent' }] } } }))
      .mockResolvedValueOnce(json({ data: { runId: 'run-sync', status: 'succeeded', replayed: false, result: { ok: true }, synced: { sessions: 3, speakers: 3 } } }))
    const api = client(fetcher)
    const emailInput = {
      idempotencyKey: 'campaign-2026-001', replyTo: 'team@example.test',
      messages: [{ speakerId: 'speaker-maya', subject: 'Welcome', text: 'Hello Maya', attachment: { filename: 'summit.ics', content: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n', type: 'text/calendar' as const } }],
    }
    await expect(api.sendEmail(emailInput)).resolves.toMatchObject({ runId: 'run-email', status: 'sent', replayed: false })
    await expect(api.syncAccelevents('sync-2026-001')).resolves.toMatchObject({ runId: 'run-sync', synced: { sessions: 3, speakers: 3 } })
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.test/api/workspaces/workspace-main/events/event-summit/integrations/email/send',
      'https://api.example.test/api/workspaces/workspace-main/events/event-summit/integrations/accelevents/sync',
    ])
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual(emailInput)
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({ idempotencyKey: 'sync-2026-001' })
  })

  it('gets and patches the authenticated speaker portal with revision protection', async () => {
    const state = createSeedState()
    const portal = {
      event: state.event, speaker: state.speakers[0],
      submissions: state.submissions.filter((submission) => submission.speakerIds.includes(state.speakers[0].id)),
      tasks: state.tasks.filter((task) => task.speakerId === state.speakers[0].id), sessions: state.sessions, resources: [],
      assets: [{ id: 'asset-1', file_name: 'deck.pdf', content_type: 'application/pdf', size_bytes: 100, created_at: state.lastUpdatedAt, downloadUrl: '/api/download' }],
    }
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: { revision: 4, portal } }, { headers: { etag: '"4"' } }))
      .mockResolvedValueOnce(json({ data: { revision: 5, portal: { ...portal, speaker: { ...portal.speaker, company: 'Updated Co' } } } }, { headers: { etag: '"5"' } }))
    const api = client(fetcher)
    await expect(api.getSpeakerPortal()).resolves.toMatchObject({ revision: 4, portal: { assets: [{ fileName: 'deck.pdf', sizeBytes: 100 }] } })
    const patch = { expectedRevision: 4, profile: { company: 'Updated Co', status: 'confirmed' as const }, taskUpdates: [{ id: portal.tasks[0].id, completed: true, assetId: 'asset-1', newComment: { id: 'comment-1', body: 'Uploaded for review', createdAt: state.lastUpdatedAt } }] }
    await expect(api.patchSpeakerPortal(patch)).resolves.toMatchObject({ revision: 5, portal: { speaker: { company: 'Updated Co' } } })
    expect(fetcher.mock.calls[1][1]?.method).toBe('PATCH')
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('if-match')).toBe('"4"')
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual(patch)
  })

  it('loads only the reviewer queue and submits a revision-protected assigned review', async () => {
    const state = createSeedState()
    const assignment = { id: 'assignment-1', roundId: 'round-1', submissionId: state.submissions[0].id, reviewerName: 'Reviewer', reviewerEmail: 'reviewer@example.test', status: 'pending', assignedAt: state.lastUpdatedAt, updatedAt: state.lastUpdatedAt }
    const round = { id: 'round-1', planId: 'plan-1', name: 'Final review', rubric: [{ id: 'criterion-1', label: 'Relevance', weight: 1, maxScore: 5 }], instructions: 'Score independently.', status: 'open', dueAt: '2026-08-20T00:00:00Z', blind: false }
    const queue = { revision: 7, event: state.event, assignments: [assignment], rounds: [round], plans: [{ id: 'plan-1', name: 'Program review' }], submissions: [state.submissions[0]], speakers: [state.speakers[0]], reviews: [] }
    const review = { id: 'review-assignment-1', assignmentId: assignment.id, submissionId: assignment.submissionId, reviewerName: 'Reviewer', reviewerEmail: assignment.reviewerEmail, reviewerUserId: 'user-reviewer', scores: { relevance: 5 }, note: 'Strong', abstained: false, updatedAt: state.lastUpdatedAt }
    const completed = { ...assignment, status: 'completed', completedAt: state.lastUpdatedAt }
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: queue }, { headers: { etag: '"7"' } }))
      .mockResolvedValueOnce(json({ data: { revision: 8, review, assignment: completed } }, { headers: { etag: '"8"' } }))
    const api = client(fetcher)
    await expect(api.getReviewerQueue()).resolves.toMatchObject({ revision: 7, event: { slug: state.event.slug }, assignments: [{ id: 'assignment-1' }], rounds: [{ id: 'round-1' }], plans: [{ id: 'plan-1' }] })
    const input = { expectedRevision: 7, assignmentId: assignment.id, submissionId: assignment.submissionId, review: { scores: { relevance: 5 }, note: 'Strong' }, assignmentStatus: 'completed' as const }
    await expect(api.submitReview(input)).resolves.toMatchObject({ revision: 8, review: { id: 'review-assignment-1' }, assignment: { status: 'completed' } })
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.test/api/workspaces/workspace-main/events/event-summit/reviewer-queue',
      'https://api.example.test/api/workspaces/workspace-main/events/event-summit/reviews',
    ])
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual(input)
  })
})
