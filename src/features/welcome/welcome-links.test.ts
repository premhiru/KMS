import { describe, expect, it } from 'vitest'
import { organizerReturnPath, organizerSignInHref, publicEntryLinks } from './welcome-links'

describe('welcome gateway links', () => {
  it('returns organizers to the scoped dashboard and removes invitation secrets', () => {
    const location = { origin: 'https://app.example.test', pathname: '/', search: '?eventId=event-1&eventSlug=summit&claimToken=secret&reviewerToken=other' }
    expect(organizerReturnPath(location)).toBe('/?eventId=event-1&eventSlug=summit#/dashboard')
    expect(decodeURIComponent(organizerSignInHref(location).split('return_to=')[1])).toBe('/?eventId=event-1&eventSlug=summit#/dashboard')
  })

  it('keeps public entry points directly accessible without authentication', () => {
    expect(publicEntryLinks).toEqual({ cfp: '#/cfp', program: '#/event', docs: '#/docs' })
  })
})
