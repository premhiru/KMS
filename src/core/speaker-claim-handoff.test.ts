import { describe, expect, it, vi } from 'vitest'
import type { OpenSpeakerApiClient } from '../services'
import { redeemSpeakerClaimOnce, speakerClaimToken, stripSpeakerClaimFromUrl } from './speaker-claim-handoff'

describe('speaker invitation handoff', () => {
  it('only reads speaker authority on the portal route', () => {
    const url = new URL('https://app.example.test/?eventId=event-1&claimToken=secret#/portal')
    expect(speakerClaimToken(url, true)).toBe('secret')
    expect(speakerClaimToken(url, false)).toBeUndefined()
  })

  it('removes both supported token names without changing event scope or route', () => {
    const clean = stripSpeakerClaimFromUrl(new URL('https://app.example.test/?eventId=event-1&eventSlug=summit&claimToken=secret&cfpClaim=legacy#/portal'))
    expect(clean.searchParams.has('claimToken')).toBe(false)
    expect(clean.searchParams.has('cfpClaim')).toBe(false)
    expect(clean.searchParams.get('eventId')).toBe('event-1')
    expect(clean.searchParams.get('eventSlug')).toBe('summit')
    expect(clean.hash).toBe('#/portal')
  })

  it('shares one redemption request across StrictMode-style repeated effects', async () => {
    let resolve!: (receipt: { claimed: true; eventId: string }) => void
    const pending = new Promise<{ claimed: true; eventId: string }>((done) => { resolve = done })
    const verifyCfpClaim = vi.fn(() => pending)
    const api = { verifyCfpClaim } as unknown as OpenSpeakerApiClient

    const first = redeemSpeakerClaimOnce(api, 'one-time-token')
    const second = redeemSpeakerClaimOnce(api, 'one-time-token')
    expect(first).toBe(second)
    expect(verifyCfpClaim).toHaveBeenCalledTimes(1)
    resolve({ claimed: true, eventId: 'event-1' })
    await expect(second).resolves.toEqual({ claimed: true, eventId: 'event-1' })
  })

  it('shares a rejected redemption so replay cannot fall through to another identity', async () => {
    const failure = new Error('Invalid invitation')
    const verifyCfpClaim = vi.fn(() => Promise.reject(failure))
    const api = { verifyCfpClaim } as unknown as OpenSpeakerApiClient

    await expect(redeemSpeakerClaimOnce(api, 'invalid-token')).rejects.toBe(failure)
    await expect(redeemSpeakerClaimOnce(api, 'invalid-token')).rejects.toBe(failure)
    expect(verifyCfpClaim).toHaveBeenCalledTimes(1)
  })
})
