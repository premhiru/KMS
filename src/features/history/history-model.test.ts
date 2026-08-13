import { describe, expect, it } from 'vitest'
import { seedState } from '../../domain/seed'
import { historyReasonLabel, revisionChanges, summarizeRevision } from './history-model'

describe('content history model', () => {
  it('summarizes the content stored in a revision', () => {
    const summary = summarizeRevision(seedState)
    expect(summary).toMatchObject({
      speakers: seedState.speakers.length,
      submissions: seedState.submissions.length,
      sessions: seedState.sessions.length,
      tasks: seedState.tasks.length,
    })
  })

  it('describes content areas changed between an old snapshot and the current state', () => {
    const oldState = structuredClone(seedState)
    const currentState = structuredClone(seedState)
    currentState.event.name = 'Restored Conference'
    currentState.sessions[0] = { ...currentState.sessions[0], published: !currentState.sessions[0].published }
    currentState.tasks = currentState.tasks.slice(1)

    expect(revisionChanges(oldState, currentState).map((change) => change.key)).toEqual(['event', 'agenda', 'deliverables'])
    expect(revisionChanges(currentState, structuredClone(currentState))).toEqual([])
  })

  it('includes exact title and abstract text when one session submission changes', () => {
    const oldState = structuredClone(seedState)
    const currentState = structuredClone(seedState)
    const original = oldState.submissions[0]
    currentState.submissions[0] = { ...currentState.submissions[0], title: `UPDATED: ${original.title}`, abstract: `${original.abstract} Attendees should bring a laptop.` }

    const change = revisionChanges(oldState, currentState).find((item) => item.key === 'submissions')
    expect(change?.before).toContain(`Title: ${original.title}`)
    expect(change?.before).toContain(`Abstract: ${original.abstract}`)
    expect(change?.after).toContain('UPDATED:')
    expect(change?.after).toContain('Attendees should bring a laptop.')
  })

  it('turns durable backend reasons into human-readable audit labels', () => {
    expect(historyReasonLabel('organizer write')).toBe('Organizer saved event content')
    expect(historyReasonLabel('rollback:12:Restore approved agenda')).toBe('Restored revision 12 — Restore approved agenda')
    expect(historyReasonLabel('event created')).toBe('Event created')
  })
})
