import type { AppState } from '../domain/types'
import { speakerName } from './selectors'

export function downloadText(filename: string, content: string, mimeType = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.hidden = true
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function icsEscape(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;')
}

function icsDate(value: string): string {
  return new Date(value).toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}Z$/, 'Z')
}

function foldIcsLine(line: string): string {
  const chunks: string[] = []
  let remaining = line
  while (remaining.length > 73) {
    chunks.push(remaining.slice(0, 73))
    remaining = ` ${remaining.slice(73)}`
  }
  chunks.push(remaining)
  return chunks.join('\r\n')
}

function icsParameter(value: string): string {
  return value.replace(/[\r\n";:,]/g, ' ').trim()
}

function invitationSequence(updatedAt: string): number {
  const epoch = Date.UTC(2000, 0, 1)
  const updated = Date.parse(updatedAt)
  return Number.isFinite(updated) ? Math.max(0, Math.floor((updated - epoch) / 1000)) : 0
}

export interface SpeakerInvitationOptions {
  organizerName?: string
  organizerEmail?: string
}

export function agendaToIcs(state: AppState, publishedOnly = true): string {
  const sessions = state.sessions.filter((session) => !publishedOnly || session.published)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OpenSpeaker//Agenda//EN',
    'CALSCALE:GREGORIAN',
    ...sessions.flatMap((session) => {
      const submission = state.submissions.find((item) => item.id === session.submissionId)
      const speakers = submission?.speakerIds.map((speakerId) => state.speakers.find((speaker) => speaker.id === speakerId)).filter((speaker) => speaker !== undefined).map(speakerName).join(', ') ?? ''
      return [
        'BEGIN:VEVENT',
        `UID:${icsEscape(`${session.id}@openspeaker.local`)}`,
        `DTSTAMP:${icsDate(state.lastUpdatedAt)}`,
        `DTSTART:${icsDate(session.startAt)}`,
        `DTEND:${icsDate(session.endAt)}`,
        `SUMMARY:${icsEscape(submission?.title ?? 'Conference session')}`,
        `DESCRIPTION:${icsEscape([submission?.abstract, speakers && `Speakers: ${speakers}`].filter(Boolean).join('\n\n'))}`,
        `LOCATION:${icsEscape(`${session.room}, ${state.event.venue}`)}`,
        'END:VEVENT',
      ]
    }),
    'END:VCALENDAR',
  ]
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`
}

/**
 * Builds an RFC 5545 scheduling request containing only the recipient's
 * sessions. UIDs remain stable across updates and SEQUENCE advances whenever
 * the stored session revision timestamp advances.
 */
export function speakerInvitationToIcs(state: AppState, speakerId: string, options: SpeakerInvitationOptions = {}): string {
  const speaker = state.speakers.find((item) => item.id === speakerId)
  if (!speaker) throw new Error('The calendar recipient is not part of this event.')
  const organizerName = icsParameter(options.organizerName ?? state.event.name)
  const organizerEmail = (options.organizerEmail ?? 'calendar@openspeaker.local').trim().toLowerCase()
  const attendeeName = icsParameter(speakerName(speaker))
  const sessions = state.sessions.filter((session) => {
    if (!session.published) return false
    const submission = state.submissions.find((item) => item.id === session.submissionId)
    return submission?.speakerIds.includes(speakerId) ?? false
  })
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OpenSpeaker//Speaker Invitations//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    ...sessions.flatMap((session) => {
      const submission = state.submissions.find((item) => item.id === session.submissionId)
      return [
        'BEGIN:VEVENT',
        `UID:${icsEscape(`${state.event.id}-${session.id}@openspeaker.local`)}`,
        `DTSTAMP:${icsDate(session.updatedAt || state.lastUpdatedAt)}`,
        `DTSTART:${icsDate(session.startAt)}`,
        `DTEND:${icsDate(session.endAt)}`,
        `SEQUENCE:${invitationSequence(session.updatedAt || state.lastUpdatedAt)}`,
        'STATUS:CONFIRMED',
        'TRANSP:OPAQUE',
        `ORGANIZER;CN=${organizerName}:mailto:${organizerEmail}`,
        `ATTENDEE;CN=${attendeeName};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${speaker.email.trim().toLowerCase()}`,
        `SUMMARY:${icsEscape(submission?.title ?? 'Conference session')}`,
        `DESCRIPTION:${icsEscape(submission?.abstract ?? '')}`,
        `LOCATION:${icsEscape(`${session.room}, ${state.event.venue}`)}`,
        'END:VEVENT',
      ]
    }),
    'END:VCALENDAR',
  ]
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`
}

export function downloadJson(filename: string, value: unknown): void {
  downloadText(filename, JSON.stringify(value, null, 2), 'application/json;charset=utf-8')
}

export function downloadCsv(filename: string, csv: string): void {
  downloadText(filename, `\uFEFF${csv}`, 'text/csv;charset=utf-8')
}

export function downloadIcs(filename: string, ics: string): void {
  downloadText(filename, ics, 'text/calendar;charset=utf-8')
}
