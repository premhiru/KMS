import { describe, expect, it } from 'vitest'
import { createSeedState } from '../../domain'
import { agendaToAcceleventsCsv } from './accelevents'

describe('Accelevents export mapping', () => {
  it('applies configured destination headings and published-session filtering', () => {
    const state = createSeedState()
    const mapping = state.event.accelevents
    if (!mapping) throw new Error('Seed must include Accelevents mapping')
    state.event.accelevents = {
      ...mapping,
      includeOnlyPublishedSessions: true,
      destinationFields: {
        title: 'Event Session', description: 'Session Summary', track: 'Content Track',
        type: 'Session Type', location: 'Stage', speakers: 'Presenters',
      },
    }
    state.sessions = state.sessions.map((session, index) => ({ ...session, published: index === 0 }))

    const csv = agendaToAcceleventsCsv(state)

    expect(csv).toContain('Event Session')
    expect(csv).toContain('Presenters')
    expect(csv.split('\n')).toHaveLength(2)
  })
})
