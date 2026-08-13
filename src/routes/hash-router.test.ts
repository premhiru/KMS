import { describe, expect, it } from 'vitest'
import { routeFromHash } from './hash-router'

describe('hash routing', () => {
  it.each(['', '#', '#/'])('maps an empty location %j to the public welcome route', (hash) => {
    expect(routeFromHash(hash)).toBe('welcome')
  })

  it.each([
    ['#/dashboard', 'dashboard'],
    ['#/submissions', 'submissions'],
    ['#/settings/profile', 'settings'],
  ])('keeps explicit private route %s protected', (hash, expected) => {
    expect(routeFromHash(hash)).toBe(expected)
  })

  it.each([
    ['#/cfp', 'cfp'],
    ['#/event/sessions', 'event'],
    ['#/docs', 'docs'],
  ])('keeps explicit public route %s unchanged', (hash, expected) => {
    expect(routeFromHash(hash)).toBe(expected)
  })

  it('does not turn a non-empty unknown route into the public welcome page', () => {
    expect(routeFromHash('#/private-typo')).toBe('dashboard')
  })
})
