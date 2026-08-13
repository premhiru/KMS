import { describe, expect, it, vi } from 'vitest'
import { organizerInvitationToken, redeemOrganizerInvitationOnce, stripOrganizerInvitationFromUrl } from './organizer-invite-handoff'

describe('organizer evaluator invitation handoff', () => {
  it('reads and strips only the organizer invitation secret', () => {
    const url = new URL('https://app.test/?eventId=event-1&organizerToken=secret#/dashboard')
    expect(organizerInvitationToken(url)).toBe('secret')
    expect(stripOrganizerInvitationFromUrl(url).toString()).toBe('https://app.test/?eventId=event-1#/dashboard')
  })

  it('shares one redemption across StrictMode effect replay', async () => {
    const receipt = { user: { id: 'user-1', email: 'eval@example.com', name: 'Evaluator' }, role: 'organizer' as const, expiresAt: '2026-09-12T00:00:00.000Z' }
    const redeemOrganizerInvitation = vi.fn().mockResolvedValue(receipt)
    const api = { redeemOrganizerInvitation } as never
    await expect(Promise.all([redeemOrganizerInvitationOnce(api, 'token'), redeemOrganizerInvitationOnce(api, 'token')])).resolves.toEqual([receipt, receipt])
    expect(redeemOrganizerInvitation).toHaveBeenCalledTimes(1)
  })
})
