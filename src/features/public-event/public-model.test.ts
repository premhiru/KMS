import { describe, expect, it } from 'vitest'
import { createSeedState } from '../../domain'
import { localDay, matchesSession, publicSessionRecords, publicSpeakerRecords, recordsForSpeaker } from './public-model'

describe('public widget projection', () => {
  it('exposes only published accepted sessions and confirmed speakers in chronological/surname order', () => {
    const state = createSeedState()
    const records = publicSessionRecords(state)
    expect(records).toHaveLength(3)
    expect(records.every((record) => record.session.published && record.submission.status === 'accepted')).toBe(true)
    expect(records.map((record) => record.session.startAt)).toEqual([...records.map((record) => record.session.startAt)].sort())
    const speakers = publicSpeakerRecords(records)
    expect(speakers.map((speaker) => speaker.lastName)).toEqual([...speakers.map((speaker) => speaker.lastName)].sort())
  })

  it('searches titles and speaker names and relates speakers back to sessions', () => {
    const records = publicSessionRecords(createSeedState())
    expect(records.filter((record) => matchesSession(record, 'chatbot'))).toHaveLength(1)
    expect(records.filter((record) => matchesSession(record, 'chen'))).toHaveLength(1)
    const speaker = records[0].speakers[0]
    expect(recordsForSpeaker(records, speaker.id).some((record) => record.session.id === records[0].session.id)).toBe(true)
  })

  it('creates stable event-local day keys', () => {
    expect(localDay('2026-09-16T17:00:00.000Z', 'America/Los_Angeles')).toBe('2026-09-16')
  })

  it('keeps draft and in-review session content out of every public widget', () => {
    const state = createSeedState()
    state.sessions[0] = { ...state.sessions[0], contentStatus: 'in-review', published: true }
    expect(publicSessionRecords(state).some((record) => record.session.id === state.sessions[0].id)).toBe(false)
  })
})
