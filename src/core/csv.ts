import type { AppState, Submission } from '../domain/types'
import { selectSubmissionScore, selectSubmissionSpeakers, speakerName } from './selectors'

export interface CsvParseResult {
  headers: string[]
  rows: Array<Record<string, string>>
  errors: string[]
}

function escapeCell(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function serializeCsv(rows: Array<Record<string, unknown>>, headers?: string[]): string {
  const columns = headers ?? [...new Set(rows.flatMap((row) => Object.keys(row)))]
  return [
    columns.map(escapeCell).join(','),
    ...rows.map((row) => columns.map((column) => escapeCell(row[column])).join(',')),
  ].join('\r\n')
}

export function parseCsv(csv: string): CsvParseResult {
  const table: string[][] = []
  const errors: string[] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]
    const next = csv[index + 1]
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"' && cell === '') {
      quoted = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') index += 1
      row.push(cell)
      table.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (quoted) errors.push('CSV contains an unterminated quoted field.')
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    table.push(row)
  }

  const [headerRow = [], ...dataRows] = table
  const headers = headerRow.map((header) => header.trim())
  if (new Set(headers).size !== headers.length) errors.push('CSV contains duplicate column headers.')
  const rows = dataRows.filter((cells) => cells.some((value) => value !== '')).map((cells, rowIndex) => {
    if (cells.length !== headers.length) errors.push(`Row ${rowIndex + 2} has ${cells.length} fields; expected ${headers.length}.`)
    return Object.fromEntries(headers.map((header, columnIndex) => [header, cells[columnIndex] ?? '']))
  })
  return { headers, rows, errors }
}

export function submissionsToCsv(state: AppState, submissions: Submission[] = state.submissions): string {
  const rows = submissions.map((submission) => ({
    id: submission.id,
    title: submission.title,
    abstract: submission.abstract,
    speakers: selectSubmissionSpeakers(state, submission.id).map(speakerName).join('; '),
    speakerEmails: selectSubmissionSpeakers(state, submission.id).map((speaker) => speaker.email).join('; '),
    track: submission.track,
    format: submission.format,
    durationMinutes: submission.durationMinutes,
    status: submission.status,
    score: selectSubmissionScore(state, submission.id)?.toFixed(2) ?? '',
    tags: submission.tags.join('; '),
    createdAt: submission.createdAt,
  }))
  return serializeCsv(rows)
}
