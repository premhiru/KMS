import { describe, expect, it } from 'vitest'
import { selectedIncompleteSpeakerIds } from './DeliverablesWorkspace'

describe('deliverable reminders', () => {
  it('returns unique speakers only for selected incomplete work', () => {
    const tasks = [
      { id: 'a', speakerId: 'speaker-1' },
      { id: 'b', speakerId: 'speaker-1' },
      { id: 'c', speakerId: 'speaker-2', completedAt: '2026-08-12T00:00:00.000Z' },
    ]
    expect(selectedIncompleteSpeakerIds(tasks, ['a', 'b', 'c'])).toEqual(['speaker-1'])
    expect(selectedIncompleteSpeakerIds(tasks, ['c'])).toEqual([])
  })
})
