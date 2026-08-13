import { describe, expect, it, vi } from 'vitest'
import { createSeedState } from '../domain'
import { OpenSpeakerApiClient } from './api-client'

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(data), { ...init, headers })
}

function client(fetcher: typeof fetch) {
  return new OpenSpeakerApiClient({
    baseUrl: 'https://api.example.test/', workspaceId: 'workspace-main', eventId: 'event-summit', eventSlug: 'summit-2026', fetch: fetcher,
    requestId: () => 'client-request', retryBaseDelayMs: 0,
  })
}

describe('operational Worker routes', () => {
  it('lists, reads, and rolls back exact state revisions', async () => {
    const state = createSeedState()
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: { eventId: 'event-summit', currentRevision: 7, revisions: [{ revision: 7, updated_by: 'user-owner', created_at: state.lastUpdatedAt, reason: 'state write', size_bytes: 4200 }] } }))
      .mockResolvedValueOnce(json({ data: { eventId: 'event-summit', revision: 6, state, updatedBy: 'user-owner', createdAt: state.lastUpdatedAt, reason: 'state write' } }, { headers: { etag: '"6"' } }))
      .mockResolvedValueOnce(json({ data: { eventId: 'event-summit', revision: 8, rolledBackFrom: 7, targetRevision: 6, updatedAt: state.lastUpdatedAt } }, { headers: { etag: '"8"' } }))
    const api = client(fetcher)

    await expect(api.getStateHistory()).resolves.toMatchObject({ currentRevision: 7, revisions: [{ updatedBy: 'user-owner', sizeBytes: 4200 }] })
    await expect(api.getStateRevision(6)).resolves.toMatchObject({ revision: 6, state: { event: { id: state.event.id } } })
    await expect(api.rollbackState({ expectedRevision: 7, targetRevision: 6, reason: 'Restore published program' })).resolves.toMatchObject({ revision: 8, targetRevision: 6 })

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.test/api/workspaces/workspace-main/events/event-summit/state/history',
      'https://api.example.test/api/workspaces/workspace-main/events/event-summit/state/history/6',
      'https://api.example.test/api/workspaces/workspace-main/events/event-summit/state/rollback',
    ])
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({ expectedRevision: 7, targetRevision: 6, reason: 'Restore published program' })
  })

  it('reads reminder schedules/run history and starts an idempotent manual run', async () => {
    const state = createSeedState()
    const schedule = state.event.reminderSchedules?.[0]
    if (!schedule) throw new Error('Seed reminder schedule is required')
    const status = { data: {
      configured: true,
      schedules: [schedule],
      runs: [{ id: 'automation-1', idempotency_key: 'manual-1', status: 'succeeded', result: { sent: 1 }, error_message: null, started_by: 'user-owner', created_at: state.lastUpdatedAt, completed_at: state.lastUpdatedAt }],
      deliveries: [{ id: 'reminder-1', run_id: 'automation-1', schedule_id: schedule.id, task_id: state.tasks[0].id, speaker_id: state.speakers[0].id, recipient_email: state.speakers[0].email, status: 'sent', provider_message_id: 'email-1', error_message: null, created_at: state.lastUpdatedAt, updated_at: state.lastUpdatedAt }],
    } }
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json(status))
      .mockResolvedValueOnce(json({ data: { runId: 'automation-2', status: 'succeeded', replayed: false, result: { evaluated: 1, sent: 1, failed: 0, skipped: 0 } } }))
    const api = client(fetcher)

    await expect(api.getReminderAutomation()).resolves.toMatchObject({ configured: true, runs: [{ idempotencyKey: 'manual-1' }], deliveries: [{ scheduleId: schedule.id, providerMessageId: 'email-1' }] })
    const input = { at: '2026-08-11T12:00:00.000Z', idempotencyKey: 'manual-2' }
    await expect(api.runReminders(input)).resolves.toMatchObject({ runId: 'automation-2', replayed: false, result: { sent: 1 } })
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.test/api/workspaces/workspace-main/events/event-summit/reminders',
      'https://api.example.test/api/workspaces/workspace-main/events/event-summit/reminders/run',
    ])
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual(input)
  })

  it('normalizes integration leases and Accelevents object mappings', async () => {
    const response = { data: {
      configured: { resend: false, accelevents: true },
      runs: [{ id: 'run-1', provider: 'accelevents', action: 'program.sync', idempotency_key: 'sync-1', status: 'running', response: {}, error_code: null, error_message: null, started_by: 'user-owner', created_at: '2026-08-11T00:00:00Z', completed_at: null, lease_expires_at: '2026-08-11T00:02:00Z', attempt_count: 2 }],
      deliveries: [],
      mappings: [{ object_type: 'session', local_id: 'session-1', remote_id: 'remote-session-1', updated_at: '2026-08-11T00:01:00Z' }],
    } }
    const api = client(vi.fn<typeof fetch>().mockResolvedValue(json(response)))
    await expect(api.getIntegrationStatus()).resolves.toMatchObject({
      runs: [{ leaseExpiresAt: '2026-08-11T00:02:00Z', attemptCount: 2 }],
      mappings: [{ objectType: 'session', localId: 'session-1', remoteId: 'remote-session-1' }],
    })
  })

  it('uses typed production routes for deliverable reminders and reviewer/speaker invitations', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: { runId: 'run-deliverables', status: 'sent', replayed: false, result: { requestedTasks: 2, recipients: 1, sent: 1, failed: 0, deliveries: [{ speakerId: 'speaker-1', taskIds: ['task-1', 'task-2'], deliveryId: 'delivery-1', status: 'sent', calendarAttached: false }] } } }))
      .mockResolvedValueOnce(json({ data: { invitationId: 'reviewer-invite-1', email: 'reviewer@example.com', status: 'sent', providerMessageId: 'resend-1', expiresAt: '2026-08-13T00:00:00Z', assignmentCount: 2 } }, { status: 201 }))
      .mockResolvedValueOnce(json({ data: { invitationId: 'speaker-invite-1', speakerId: 'speaker-1', email: 'speaker@example.com', status: 'sent', providerMessageId: 'resend-2', expiresAt: '2026-08-13T00:00:00Z' } }, { status: 201 }))
    const api = client(fetcher)
    await expect(api.sendDeliverableReminders({ idempotencyKey: 'deliverables-001', taskIds: ['task-1', 'task-2'] })).resolves.toMatchObject({ result: { sent: 1, deliveries: [{ calendarAttached: false }] } })
    await expect(api.inviteReviewer({ email: 'reviewer@example.com', returnUrl: 'https://app.example.test/#/reviews', purpose: 'reminder', roundId: 'round-1' })).resolves.toMatchObject({ status: 'sent', assignmentCount: 2 })
    await expect(api.inviteSpeaker({ speakerId: 'speaker-1', returnUrl: 'https://app.example.test/#/portal' })).resolves.toMatchObject({ status: 'sent', speakerId: 'speaker-1' })
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.test/api/workspaces/workspace-main/events/event-summit/deliverables/reminders',
      'https://api.example.test/api/workspaces/workspace-main/events/event-summit/reviewer-invitations',
      'https://api.example.test/api/workspaces/workspace-main/events/event-summit/speaker-invitations',
    ])
  })

  it('creates and redeems temporary organizer evaluator invitations', async () => {
    const expiresAt = '2026-09-12T00:00:00.000Z'
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: { invitations: [{ id: 'organizer-invite-1', url: 'https://app.example.test/?organizerToken=secret#/dashboard', expiresAt }], count: 1, expiresAt } }, { status: 201 }))
      .mockResolvedValueOnce(json({ data: { user: { id: 'evaluator-1', email: 'evaluator@example.com', name: 'Evaluator' }, role: 'organizer', expiresAt } }))
    const api = client(fetcher)
    await expect(api.createOrganizerInvitations({ count: 1, accessDays: 30, returnUrl: 'https://app.example.test/#/dashboard' })).resolves.toMatchObject({ count: 1, invitations: [{ id: 'organizer-invite-1' }] })
    await expect(api.redeemOrganizerInvitation('secret')).resolves.toMatchObject({ role: 'organizer', user: { email: 'evaluator@example.com' } })
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.test/api/workspaces/workspace-main/organizer-invitations',
      'https://api.example.test/api/public/organizer-invitations/workspace-main?token=secret',
    ])
  })

  it('retains only the approved versioned resource-file contract in the speaker portal projection', async () => {
    const state = createSeedState()
    const portal = {
      event: state.event, speaker: state.speakers[0], submissions: [], tasks: [], sessions: [], assets: [],
      resources: [{ id: 'resource-1', title: 'Speaker handbook', body: 'Approved guidance', version: 3, approvalStatus: 'approved', updatedAt: state.lastUpdatedAt, files: [{ id: 'file-1', name: 'handbook.pdf', assetId: 'asset-1', url: '/api/workspaces/workspace-main/events/event-summit/assets/asset-1', contentType: 'application/pdf', size: 2048, version: 2, approvalStatus: 'approved', uploadedAt: state.lastUpdatedAt, approvedAt: state.lastUpdatedAt }] }],
    }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ data: { revision: 9, portal } }, { headers: { etag: '"9"' } }))
    await expect(client(fetcher).getSpeakerPortal()).resolves.toMatchObject({ portal: { resources: [{ version: 3, approvalStatus: 'approved', files: [{ name: 'handbook.pdf', version: 2, approvalStatus: 'approved', assetId: 'asset-1' }] }] } })
  })
})
