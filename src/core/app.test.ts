import { describe, expect, it } from 'vitest'
import { conflictsForSession, createSeedState, findScheduleConflicts } from '../domain'
import type { Session } from '../domain'
import { appReducer } from './reducer'
import { exportAppState, importAppState, validateAppState } from './storage'
import { renderTemplate } from './templates'

describe('application lifecycle', () => {
  it('moves a reviewed proposal into onboarding without duplicate tasks', () => {
    const at = '2026-08-11T10:00:00.000Z'
    const seed = createSeedState()
    const accepted = appReducer(seed, { type: 'submission/decide', id: 'submission-tools', status: 'accepted', at })
    const speakerTasks = accepted.tasks.filter((task) => task.speakerId === 'speaker-leo')

    expect(accepted.submissions.find((item) => item.id === 'submission-tools')?.status).toBe('accepted')
    expect(speakerTasks.map((task) => task.kind).sort()).toEqual(['agreement', 'headshot', 'profile', 'session-details', 'slides', 'supporting-document'])

    const acceptedAgain = appReducer(accepted, { type: 'submission/decide', id: 'submission-tools', status: 'accepted', at })
    expect(acceptedAgain.tasks.filter((task) => task.speakerId === 'speaker-leo')).toHaveLength(6)
  })

  it('completes and reopens a persisted onboarding task', () => {
    const seed = createSeedState()
    const task = seed.tasks[0]
    const completed = appReducer(seed, { type: 'task/toggle', id: task.id, completed: true, at: '2026-08-11T10:00:00.000Z' })
    expect(completed.tasks.find((item) => item.id === task.id)?.completedAt).toBe('2026-08-11T10:00:00.000Z')
    const reopened = appReducer(completed, { type: 'task/toggle', id: task.id, completed: false, at: '2026-08-11T11:00:00.000Z' })
    expect(reopened.tasks.find((item) => item.id === task.id)?.completedAt).toBeUndefined()
  })

  it('persists an organizer-defined supporting-document request and uploaded version', () => {
    const seed = createSeedState()
    const at = '2026-08-11T10:00:00.000Z'
    const task = {
      id: 'task-speaker-maya-release', speakerId: 'speaker-maya', kind: 'supporting-document' as const,
      title: 'Upload signed media release', dueAt: '2026-08-20T00:00:00.000Z', updatedAt: at,
    }
    const assigned = appReducer(seed, { type: 'task/upsert', task, at })
    const uploaded = appReducer(assigned, { type: 'task/toggle', id: task.id, completed: true, asset: {
      id: 'asset-release', name: 'release.pdf', type: 'application/pdf', size: 512, selectedAt: at, storage: 'r2',
    }, at })

    expect(uploaded.tasks.find((item) => item.id === task.id)).toMatchObject({
      kind: 'supporting-document', completedAt: at, assetVersion: 1, approvalStatus: 'pending',
      asset: { id: 'asset-release', name: 'release.pdf' },
    })
  })

  it('detects room and speaker collisions before publishing', () => {
    const seed = createSeedState()
    const candidate: Session = {
      id: 'session-collision',
      submissionId: 'submission-agents',
      room: 'Studio A',
      startAt: '2026-09-16T17:00:00.000Z',
      endAt: '2026-09-16T17:30:00.000Z',
      published: false,
      updatedAt: seed.lastUpdatedAt,
    }
    expect(conflictsForSession(candidate, seed).map((conflict) => conflict.kind)).toContain('room-overlap')
    const withCollision = { ...seed, sessions: [...seed.sessions, candidate] }
    expect(findScheduleConflicts(withCollision).some((conflict) => conflict.kind === 'speaker-overlap')).toBe(true)
  })

  it('detects parallel sessions assigned to the same track', () => {
    const seed = createSeedState()
    const extraSubmission = { ...seed.submissions[0], id: 'submission-agents-parallel', speakerIds: ['speaker-leo'] }
    const candidate: Session = {
      id: 'session-track-collision', submissionId: extraSubmission.id, room: 'Studio A',
      startAt: '2026-09-16T17:00:00.000Z', endAt: '2026-09-16T17:30:00.000Z',
      published: false, updatedAt: seed.lastUpdatedAt,
    }
    const state = { ...seed, submissions: [...seed.submissions, extraSubmission] }
    expect(conflictsForSession(candidate, state).map((conflict) => conflict.kind)).toContain('track-overlap')
  })

  it('round-trips valid state and rejects broken relationships', () => {
    const seed = createSeedState()
    const imported = importAppState(exportAppState(seed))
    expect(imported.ok).toBe(true)

    const broken = structuredClone(seed)
    broken.submissions[0].speakerIds = ['missing-speaker']
    const result = validateAppState(broken)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(' ')).toContain('known speakers')
  })

  it('renders personalized templates and reports missing tokens', () => {
    const seed = createSeedState()
    const rendered = renderTemplate(
      { subject: 'Welcome {{speaker.firstName}}', body: '{{event.name}} — {{task.unknown}}' },
      { event: seed.event, speaker: seed.speakers[0] },
    )
    expect(rendered.subject).toBe('Welcome Maya')
    expect(rendered.body).toContain(seed.event.name)
    expect(rendered.unresolvedTokens).toEqual(['task.unknown'])
  })
})
