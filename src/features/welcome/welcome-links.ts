export interface WelcomeLocation {
  origin: string
  pathname: string
  search: string
}

export function organizerReturnPath(location: Pick<WelcomeLocation, 'pathname' | 'search'>): string {
  const query = new URLSearchParams(location.search)
  query.delete('claimToken')
  query.delete('cfpClaim')
  query.delete('reviewerToken')
  const search = query.toString()
  return `${location.pathname}${search ? `?${search}` : ''}#/dashboard`
}

export function organizerSignInHref(location: WelcomeLocation): string {
  return `/signin-with-chatgpt?return_to=${encodeURIComponent(organizerReturnPath(location))}`
}

export const publicEntryLinks = {
  cfp: '#/cfp',
  program: '#/event',
  docs: '#/docs',
} as const
