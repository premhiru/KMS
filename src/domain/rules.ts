import type { AppState, Id, Session, Submission } from './types'

export type ScheduleConflictKind = 'invalid-time' | 'outside-event' | 'unknown-room' | 'room-overlap' | 'track-overlap' | 'speaker-overlap' | 'speaker-unavailable'

export interface ScheduleConflict {
  kind: ScheduleConflictKind
  sessionId: Id
  otherSessionId?: Id
  speakerIds?: Id[]
  message: string
}

function millis(value: string): number {
  return Date.parse(value)
}

export function intervalsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return millis(aStart) < millis(bEnd) && millis(bStart) < millis(aEnd)
}

export function sessionSpeakerIds(session: Pick<Session, 'submissionId'>, submissions: Submission[]): Id[] {
  return submissions.find((submission) => submission.id === session.submissionId)?.speakerIds ?? []
}

export function conflictsForSession(candidate: Session, state: AppState): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = []
  const start = millis(candidate.startAt)
  const end = millis(candidate.endAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    return [{ kind: 'invalid-time', sessionId: candidate.id, message: 'Session must have a valid end time after its start time.' }]
  }

  if (start < millis(state.event.startAt) || end > millis(state.event.endAt)) {
    conflicts.push({ kind: 'outside-event', sessionId: candidate.id, message: 'Session falls outside the event dates.' })
  }
  if (!state.event.rooms.includes(candidate.room)) {
    conflicts.push({ kind: 'unknown-room', sessionId: candidate.id, message: `${candidate.room} is not an event room.` })
  }

  const candidateSpeakerIds = sessionSpeakerIds(candidate, state.submissions)
  const candidateTrack = state.submissions.find((submission) => submission.id === candidate.submissionId)?.track
  for (const other of state.sessions) {
    if (other.id === candidate.id || !intervalsOverlap(candidate.startAt, candidate.endAt, other.startAt, other.endAt)) continue
    if (candidate.room === other.room) {
      conflicts.push({ kind: 'room-overlap', sessionId: candidate.id, otherSessionId: other.id, message: `${candidate.room} already has a session at this time.` })
    }
    const otherTrack = state.submissions.find((submission) => submission.id === other.submissionId)?.track
    if (candidateTrack && otherTrack === candidateTrack) {
      conflicts.push({ kind: 'track-overlap', sessionId: candidate.id, otherSessionId: other.id, message: `${candidateTrack} has overlapping sessions in different rooms.` })
    }
    const sharedSpeakerIds = sessionSpeakerIds(other, state.submissions).filter((speakerId) => candidateSpeakerIds.includes(speakerId))
    if (sharedSpeakerIds.length > 0) {
      conflicts.push({ kind: 'speaker-overlap', sessionId: candidate.id, otherSessionId: other.id, speakerIds: sharedSpeakerIds, message: 'A speaker is assigned to overlapping sessions.' })
    }
  }

  for (const speakerId of candidateSpeakerIds) {
    const speaker = state.speakers.find((item) => item.id === speakerId)
    if (!speaker || speaker.availability.length === 0) continue
    const isAvailable = speaker.availability.some((window) => millis(window.startAt) <= start && millis(window.endAt) >= end)
    if (!isAvailable) {
      conflicts.push({ kind: 'speaker-unavailable', sessionId: candidate.id, speakerIds: [speakerId], message: `${speaker.firstName} ${speaker.lastName} is unavailable at this time.` })
    }
  }
  return conflicts
}

export function findScheduleConflicts(state: AppState): ScheduleConflict[] {
  const seen = new Set<string>()
  return state.sessions.flatMap((session) => conflictsForSession(session, state)).filter((conflict) => {
    const pair = conflict.otherSessionId
      ? [conflict.sessionId, conflict.otherSessionId].sort().join(':')
      : conflict.sessionId
    const key = `${conflict.kind}:${pair}:${conflict.speakerIds?.slice().sort().join(',') ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function canPublishAgenda(state: AppState): boolean {
  return state.sessions.length > 0 && findScheduleConflicts(state).length === 0
}

export function reviewAverage(scores: Record<string, number>): number {
  const values = Object.values(scores).filter(Number.isFinite)
  return values.length === 0 ? 0 : values.reduce((total, score) => total + score, 0) / values.length
}
