import type { AppState, Session, Speaker, Submission } from '../../domain'

export type PublicWidgetType = 'sessions' | 'speakers' | 'agenda' | 'itinerary' | 'gallery'

export interface PublicSessionRecord {
  session: Session
  submission: Submission
  speakers: Speaker[]
}

export function publicSessionRecords(state: AppState): PublicSessionRecord[] {
  return state.sessions
    .filter((session) => session.published)
    .map((session) => {
      const submission = state.submissions.find((item) => item.id === session.submissionId)
      if (!submission || submission.status !== 'accepted') return undefined
      const speakers = submission.speakerIds
        .map((id) => state.speakers.find((speaker) => speaker.id === id))
        .filter((speaker): speaker is Speaker => Boolean(speaker && speaker.status === 'confirmed'))
      return { session, submission, speakers }
    })
    .filter((record): record is PublicSessionRecord => Boolean(record))
    .sort((left, right) => left.session.startAt.localeCompare(right.session.startAt))
}

export function publicSpeakerRecords(records: PublicSessionRecord[]): Speaker[] {
  const ids = new Set(records.flatMap((record) => record.speakers.map((speaker) => speaker.id)))
  return records
    .flatMap((record) => record.speakers)
    .filter((speaker, index, speakers) => ids.has(speaker.id) && speakers.findIndex((item) => item.id === speaker.id) === index)
    .sort((left, right) => left.lastName.localeCompare(right.lastName) || left.firstName.localeCompare(right.firstName))
}

export function localDay(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function recordsForSpeaker(records: PublicSessionRecord[], speakerId: string): PublicSessionRecord[] {
  return records.filter((record) => record.speakers.some((speaker) => speaker.id === speakerId))
}

export function matchesSession(record: PublicSessionRecord, query: string): boolean {
  const haystack = [
    record.submission.title,
    record.submission.abstract,
    record.submission.track,
    record.submission.format,
    record.session.room,
    ...record.speakers.flatMap((speaker) => [speaker.firstName, speaker.lastName, speaker.company, speaker.jobTitle]),
  ].join(' ').toLowerCase()
  return haystack.includes(query.trim().toLowerCase())
}
