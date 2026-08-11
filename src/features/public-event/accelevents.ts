import type { AppState } from '../../domain'
import { serializeCsv, speakerName } from '../../core'

function localParts(value: string, timezone: string): { date: string; time: string } {
  const date = new Date(value)
  return {
    date: new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date),
    time: new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date),
  }
}

export function agendaToAcceleventsCsv(state: AppState): string {
  return serializeCsv(state.sessions.filter((session) => session.published).map((session) => {
    const submission = state.submissions.find((item) => item.id === session.submissionId)
    const start = localParts(session.startAt, state.event.timezone)
    const end = localParts(session.endAt, state.event.timezone)
    const speakers = submission?.speakerIds.map((id) => state.speakers.find((speaker) => speaker.id === id)).filter((speaker) => speaker !== undefined).map(speakerName).join('; ') ?? ''
    return {
      'Session Name': submission?.title ?? 'Untitled session',
      Description: submission?.abstract ?? '',
      Track: submission?.track ?? '',
      Type: submission?.format ?? '',
      Location: session.room,
      'Start Date': start.date,
      'Start Time': start.time,
      'End Date': end.date,
      'End Time': end.time,
      Speakers: speakers,
      Published: 'Yes',
    }
  }))
}
