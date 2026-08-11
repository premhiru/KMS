import { describe, expect, it } from 'vitest'
import { createSeedState } from '../domain/seed'
import { canAcceptRemoteSnapshot, rebaseAppState, reconcileSavedState } from './reconcile'

describe('shared state reconciliation', () => {
  it('preserves disjoint remote and local entity edits', () => {
    const base = createSeedState()
    const local = structuredClone(base)
    const remote = structuredClone(base)
    local.speakers[0] = { ...local.speakers[0], bio: 'Locally edited biography' }
    remote.submissions[0] = { ...remote.submissions[0], title: 'Remotely edited title' }

    const rebased = rebaseAppState(base, local, remote)
    expect(rebased.speakers[0].bio).toBe('Locally edited biography')
    expect(rebased.submissions[0].title).toBe('Remotely edited title')
  })

  it('carries local deletions and remote additions into the rebased state', () => {
    const base = createSeedState()
    const local = { ...structuredClone(base), submissions: base.submissions.slice(1) }
    const remote = structuredClone(base)
    remote.submissions.push({ ...remote.submissions[0], id: 'remote-new', title: 'Remote addition' })

    const rebased = rebaseAppState(base, local, remote)
    expect(rebased.submissions.some((item) => item.id === base.submissions[0].id)).toBe(false)
    expect(rebased.submissions.some((item) => item.id === 'remote-new')).toBe(true)
  })

  it('preserves disjoint edits to different fields of the same entity', () => {
    const base = createSeedState()
    const local = structuredClone(base)
    const remote = structuredClone(base)
    local.speakers[0] = { ...local.speakers[0], bio: 'Locally edited biography' }
    remote.speakers[0] = { ...remote.speakers[0], company: 'Remote Company' }

    const rebased = rebaseAppState(base, local, remote)
    expect(rebased.speakers[0].bio).toBe('Locally edited biography')
    expect(rebased.speakers[0].company).toBe('Remote Company')
  })

  it('merges disjoint changes inside nested event configuration', () => {
    const base = createSeedState()
    const local = structuredClone(base)
    const remote = structuredClone(base)
    local.event.cfp = { ...local.event.cfp!, thankYouMessage: 'Local confirmation copy' }
    remote.event.cfp = { ...remote.event.cfp!, welcomeMessage: 'Remote welcome copy' }

    const rebased = rebaseAppState(base, local, remote)
    expect(rebased.event.cfp?.thankYouMessage).toBe('Local confirmation copy')
    expect(rebased.event.cfp?.welcomeMessage).toBe('Remote welcome copy')
  })

  it('retains an edit dispatched while a normalized save response was in flight', () => {
    const written = createSeedState()
    const pending = structuredClone(written)
    const server = structuredClone(written)
    pending.speakers[0] = { ...pending.speakers[0], bio: 'Typed while saving' }
    server.speakers[0] = { ...server.speakers[0], company: 'Server-normalized company' }

    const reconciled = reconcileSavedState(written, pending, server)
    expect(reconciled.speakers[0].bio).toBe('Typed while saving')
    expect(reconciled.speakers[0].company).toBe('Server-normalized company')
    expect(reconcileSavedState(written, written, server)).toBe(server)
  })

  it('rejects stale poll responses after a local mutation, save, or newer revision', () => {
    const baseGuard = {
      incomingRevision: 3,
      currentRevision: 2,
      requestMutationVersion: 4,
      currentMutationVersion: 4,
      hasPendingChanges: false,
      isSaving: false,
      isCurrentRequest: true,
    }
    expect(canAcceptRemoteSnapshot(baseGuard)).toBe(true)
    expect(canAcceptRemoteSnapshot({ ...baseGuard, currentMutationVersion: 5 })).toBe(false)
    expect(canAcceptRemoteSnapshot({ ...baseGuard, hasPendingChanges: true })).toBe(false)
    expect(canAcceptRemoteSnapshot({ ...baseGuard, isSaving: true })).toBe(false)
    expect(canAcceptRemoteSnapshot({ ...baseGuard, currentRevision: 3 })).toBe(false)
    expect(canAcceptRemoteSnapshot({ ...baseGuard, isCurrentRequest: false })).toBe(false)
  })
})
