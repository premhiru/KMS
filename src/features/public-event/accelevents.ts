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
  const config = state.event.accelevents
  const fields = config?.destinationFields ?? { title: 'Session Name', description: 'Description', track: 'Track', type: 'Type', location: 'Location', speakers: 'Speakers' }
  return serializeCsv(state.sessions.filter((session) => !config?.includeOnlyPublishedSessions || session.published).map((session) => {
    const submission = state.submissions.find((item) => item.id === session.submissionId)
    const start = localParts(session.startAt, state.event.timezone)
    const end = localParts(session.endAt, state.event.timezone)
    const speakers = submission?.speakerIds.flatMap((id) => {
      const speaker = state.speakers.find((item) => item.id === id)
      return speaker ? [speaker] : []
    }).filter((speaker) => !config?.includeOnlyConfirmedSpeakers || speaker.status === 'confirmed').map(speakerName).join('; ') ?? ''
    return {
      [fields.title]: submission?.title ?? 'Untitled session',
      [fields.description]: submission?.abstract ?? '',
      [fields.track]: submission?.track ?? '',
      [fields.type]: submission?.format ?? '',
      [fields.location]: session.room,
      'Start Date': start.date,
      'Start Time': start.time,
      'End Date': end.date,
      'End Time': end.time,
      [fields.speakers]: speakers,
      Published: 'Yes',
    }
  }))
}
