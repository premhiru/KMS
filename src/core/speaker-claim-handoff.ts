import type { OpenSpeakerApiClient, PublicCfpClaimReceipt } from '../services'

const inFlightClaims = new WeakMap<OpenSpeakerApiClient, Map<string, Promise<PublicCfpClaimReceipt>>>()

export function speakerClaimToken(url: URL, portalRoute: boolean): string | undefined {
  if (!portalRoute) return undefined
  return url.searchParams.get('claimToken') ?? url.searchParams.get('cfpClaim') ?? undefined
}

export function stripSpeakerClaimFromUrl(url = new URL(window.location.href)): URL {
  const clean = new URL(url)
  clean.searchParams.delete('claimToken')
  clean.searchParams.delete('cfpClaim')
  return clean
}

/**
 * React StrictMode intentionally replays effects. Sharing the redemption promise
 * prevents a one-time invitation from being consumed twice while still allowing
 * both effect runs to continue once the same redemption completes.
 */
export function redeemSpeakerClaimOnce(api: OpenSpeakerApiClient, token: string): Promise<PublicCfpClaimReceipt> {
  let claims = inFlightClaims.get(api)
  if (!claims) {
    claims = new Map()
    inFlightClaims.set(api, claims)
  }
  const existing = claims.get(token)
  if (existing) return existing
  const redemption = api.verifyCfpClaim(token)
  claims.set(token, redemption)
  return redemption
}
