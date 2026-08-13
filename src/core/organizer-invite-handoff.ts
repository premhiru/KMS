import type { OpenSpeakerApiClient, OrganizerInvitationRedemption } from '../services'

const inFlightRedemptions = new WeakMap<OpenSpeakerApiClient, Map<string, Promise<OrganizerInvitationRedemption>>>()

export function organizerInvitationToken(url: URL): string | undefined {
  return url.searchParams.get('organizerToken') ?? undefined
}

export function stripOrganizerInvitationFromUrl(url = new URL(window.location.href)): URL {
  const clean = new URL(url)
  clean.searchParams.delete('organizerToken')
  return clean
}

export function redeemOrganizerInvitationOnce(api: OpenSpeakerApiClient, token: string): Promise<OrganizerInvitationRedemption> {
  let invitations = inFlightRedemptions.get(api)
  if (!invitations) {
    invitations = new Map()
    inFlightRedemptions.set(api, invitations)
  }
  const existing = invitations.get(token)
  if (existing) return existing
  const redemption = api.redeemOrganizerInvitation(token)
  invitations.set(token, redemption)
  return redemption
}
