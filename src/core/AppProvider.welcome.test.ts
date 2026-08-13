import { describe, expect, it } from 'vitest'
import { createSeedState } from '../domain'
import { createPublicWelcomeState } from './public-welcome-state'

describe('public welcome provider state', () => {
  it('contains no seeded event, speaker, proposal, review, task, session, or communication data', () => {
    const seeded = createSeedState()
    const welcome = createPublicWelcomeState()

    expect(welcome.event).toMatchObject({ id: 'public-welcome', name: 'OpenSpeaker', slug: 'welcome' })
    expect(welcome.speakers).toEqual([])
    expect(welcome.submissions).toEqual([])
    expect(welcome.reviews).toEqual([])
    expect(welcome.tasks).toEqual([])
    expect(welcome.sessions).toEqual([])
    expect(welcome.templates).toEqual([])
    expect(welcome.communicationLog).toEqual([])
    expect(JSON.stringify(welcome)).not.toContain(seeded.event.name)
    for (const speaker of seeded.speakers) expect(JSON.stringify(welcome)).not.toContain(speaker.email)
  })

  it('returns a fresh state document for each public request', () => {
    const first = createPublicWelcomeState()
    first.event.name = 'Mutated in a consumer'
    expect(createPublicWelcomeState().event.name).toBe('OpenSpeaker')
  })
})
