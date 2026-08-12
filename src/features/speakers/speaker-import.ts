import { parseCsv } from '../../core/csv'
import type { SpeakerInput } from '../../domain'

export type SpeakerImportField = 'name' | 'firstName' | 'lastName' | 'email' | 'jobTitle' | 'company' | 'bio'
export type SpeakerImportMapping = Partial<Record<SpeakerImportField, string>>

const aliases: Record<SpeakerImportField, string[]> = {
  name: ['name', 'full name', 'speaker'], firstName: ['first name', 'firstname'], lastName: ['last name', 'lastname'],
  email: ['email', 'email address'], jobTitle: ['title', 'job title', 'role'], company: ['company', 'organization', 'organisation'], bio: ['bio', 'biography'],
}

export function suggestSpeakerMapping(headers: string[]): SpeakerImportMapping {
  const match = (field: SpeakerImportField) => headers.find((header) => aliases[field].includes(header.trim().toLowerCase()))
  return Object.fromEntries((Object.keys(aliases) as SpeakerImportField[]).map((field) => [field, match(field)]).filter(([, value]) => value))
}

export function parseSpeakerCsv(source: string, mapping?: SpeakerImportMapping) {
  const parsed = parseCsv(source)
  const resolved = mapping ?? suggestSpeakerMapping(parsed.headers)
  const errors = [...parsed.errors]
  const speakers: SpeakerInput[] = []
  parsed.rows.forEach((row, index) => {
    const fullName = resolved.name ? row[resolved.name]?.trim() : ''
    const pieces = fullName.split(/\s+/).filter(Boolean)
    const firstName = (resolved.firstName ? row[resolved.firstName] : pieces.shift())?.trim() ?? ''
    const lastName = (resolved.lastName ? row[resolved.lastName] : pieces.join(' '))?.trim() ?? ''
    const email = resolved.email ? row[resolved.email]?.trim().toLowerCase() : ''
    if (!firstName || !lastName || !email) { errors.push(`Row ${index + 2} needs a first name, last name, and email.`); return }
    speakers.push({ firstName, lastName, email, jobTitle: resolved.jobTitle ? row[resolved.jobTitle] : '', company: resolved.company ? row[resolved.company] : '', bio: resolved.bio ? row[resolved.bio] : '', status: 'invited' })
  })
  return { ...parsed, mapping: resolved, speakers, errors }
}
