import { describe, expect, it } from 'vitest'
import { createSeedState } from '../domain'
import { speakerInvitationToIcs } from './downloads'

describe('speaker calendar invitations', () => {
  it('creates a recipient-scoped RFC 5545 request with stable update identity', () => {
    const state = createSeedState()
    const speakerId = 'speaker-maya'
    const ownedSession = state.sessions.find((session) => state.submissions.find((submission) => submission.id === session.submissionId)?.speakerIds.includes(speakerId))
    if (!ownedSession) throw new Error('Seed session for Maya is required')
    const unrelatedSession = state.sessions.find((session) => session.id !== ownedSession.id)
    const invitation = speakerInvitationToIcs(state, speakerId, { organizerName: 'Program Team', organizerEmail: 'program@example.com' })
    const unfolded = invitation.replace(/\r\n[ \t]/g, '')

    expect(invitation).toContain('METHOD:REQUEST\r\n')
    expect(invitation).toContain(`UID:${state.event.id}-${ownedSession.id}@openspeaker.local`)
    expect(invitation).toContain('ORGANIZER;CN=Program Team:mailto:program@example.com')
    expect(unfolded).toContain('ATTENDEE;CN=Maya Chen;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:maya@example.com')
    expect(invitation).toContain('STATUS:CONFIRMED')
    expect(invitation).toMatch(/SEQUENCE:\d+/)
    if (unrelatedSession) expect(invitation).not.toContain(`${unrelatedSession.id}@openspeaker.local`)

    const updated = { ...state, sessions: state.sessions.map((session) => session.id === ownedSession.id ? { ...session, room: 'New room', updatedAt: '2026-08-12T00:00:00.000Z' } : session) }
    const revised = speakerInvitationToIcs(updated, speakerId, { organizerEmail: 'program@example.com' })
    expect(revised).toContain(`UID:${state.event.id}-${ownedSession.id}@openspeaker.local`)
    expect(revised).toContain('LOCATION:New room')
    expect(revised.match(/SEQUENCE:(\d+)/)?.[1]).not.toBe(invitation.match(/SEQUENCE:(\d+)/)?.[1])
  })
})
