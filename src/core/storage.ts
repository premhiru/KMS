import { createSeedState } from '../domain/seed'
import { APP_SCHEMA_VERSION, type AppState } from '../domain/types'

export const APP_STORAGE_KEY = 'openspeaker:v1'

export type ValidationResult =
  | { ok: true; value: AppState }
  | { ok: false; errors: string[] }

export type StorageResult =
  | { ok: true }
  | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === 'string' && record[key] !== ''
}

function validateEntityArray(root: Record<string, unknown>, key: string, requiredStrings: string[], errors: string[]): Array<Record<string, unknown>> {
  const value = root[key]
  if (!Array.isArray(value)) {
    errors.push(`${key} must be an array.`)
    return []
  }
  const entities: Array<Record<string, unknown>> = []
  const ids = new Set<string>()
  value.forEach((entity, index) => {
    if (!isRecord(entity)) {
      errors.push(`${key}[${index}] must be an object.`)
      return
    }
    for (const field of requiredStrings) {
      if (!hasString(entity, field)) errors.push(`${key}[${index}].${field} must be a non-empty string.`)
    }
    if (typeof entity.id === 'string') {
      if (ids.has(entity.id)) errors.push(`${key} contains duplicate id “${entity.id}”.`)
      ids.add(entity.id)
    }
    entities.push(entity)
  })
  return entities
}

export function validateAppState(value: unknown): ValidationResult {
  const errors: string[] = []
  if (!isRecord(value)) return { ok: false, errors: ['Imported data must be a JSON object.'] }
  if (value.schemaVersion !== APP_SCHEMA_VERSION) errors.push(`Unsupported schema version. Expected ${APP_SCHEMA_VERSION}.`)
  if (!hasString(value, 'lastUpdatedAt')) errors.push('lastUpdatedAt must be a non-empty string.')
  if (!isRecord(value.event)) {
    errors.push('event must be an object.')
  } else {
    for (const field of ['id', 'name', 'slug', 'venue', 'timezone', 'startAt', 'endAt']) {
      if (!hasString(value.event, field)) errors.push(`event.${field} must be a non-empty string.`)
    }
    if (!Array.isArray(value.event.rooms) || !value.event.rooms.every((room) => typeof room === 'string')) errors.push('event.rooms must be a string array.')
    if (!Array.isArray(value.event.tracks) || !value.event.tracks.every((track) => typeof track === 'string')) errors.push('event.tracks must be a string array.')
  }

  const speakers = validateEntityArray(value, 'speakers', ['id', 'firstName', 'lastName', 'email', 'createdAt', 'updatedAt'], errors)
  const submissions = validateEntityArray(value, 'submissions', ['id', 'title', 'track', 'format', 'status', 'createdAt', 'updatedAt'], errors)
  const reviews = validateEntityArray(value, 'reviews', ['id', 'submissionId', 'reviewerName', 'updatedAt'], errors)
  const tasks = validateEntityArray(value, 'tasks', ['id', 'speakerId', 'kind', 'title', 'dueAt', 'updatedAt'], errors)
  const sessions = validateEntityArray(value, 'sessions', ['id', 'submissionId', 'room', 'startAt', 'endAt', 'updatedAt'], errors)
  validateEntityArray(value, 'templates', ['id', 'name', 'subject', 'body', 'audience', 'updatedAt'], errors)
  const communicationLog = validateEntityArray(value, 'communicationLog', ['id', 'subject', 'body', 'channel', 'status', 'sentAt'], errors)

  const speakerIds = new Set(speakers.map((speaker) => speaker.id).filter((id): id is string => typeof id === 'string'))
  const submissionIds = new Set(submissions.map((submission) => submission.id).filter((id): id is string => typeof id === 'string'))
  submissions.forEach((submission, index) => {
    if (!Array.isArray(submission.speakerIds) || !submission.speakerIds.every((id) => typeof id === 'string' && speakerIds.has(id))) {
      errors.push(`submissions[${index}].speakerIds must reference known speakers.`)
    }
    if (typeof submission.durationMinutes !== 'number' || submission.durationMinutes <= 0) errors.push(`submissions[${index}].durationMinutes must be positive.`)
  })
  reviews.forEach((review, index) => {
    if (typeof review.submissionId === 'string' && !submissionIds.has(review.submissionId)) errors.push(`reviews[${index}] references an unknown submission.`)
    if (!isRecord(review.scores)) errors.push(`reviews[${index}].scores must be an object.`)
  })
  tasks.forEach((task, index) => {
    if (typeof task.speakerId === 'string' && !speakerIds.has(task.speakerId)) errors.push(`tasks[${index}] references an unknown speaker.`)
  })
  sessions.forEach((session, index) => {
    if (typeof session.submissionId === 'string' && !submissionIds.has(session.submissionId)) errors.push(`sessions[${index}] references an unknown submission.`)
  })
  communicationLog.forEach((entry, index) => {
    if (!Array.isArray(entry.recipientSpeakerIds) || !entry.recipientSpeakerIds.every((id) => typeof id === 'string' && speakerIds.has(id))) {
      errors.push(`communicationLog[${index}].recipientSpeakerIds must reference known speakers.`)
    }
  })

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: value as unknown as AppState }
}

function defaultStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

export function loadAppState(storage: Storage | undefined = defaultStorage()): AppState {
  if (!storage) return createSeedState()
  try {
    const saved = storage.getItem(APP_STORAGE_KEY)
    if (!saved) return createSeedState()
    const validated = validateAppState(JSON.parse(saved) as unknown)
    return validated.ok ? validated.value : createSeedState()
  } catch {
    return createSeedState()
  }
}

export function saveAppState(state: AppState, storage: Storage | undefined = defaultStorage()): StorageResult {
  if (!storage) return { ok: false, error: 'Browser storage is unavailable.' }
  try {
    storage.setItem(APP_STORAGE_KEY, JSON.stringify(state))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to save application data.' }
  }
}

export function resetAppState(storage: Storage | undefined = defaultStorage()): AppState {
  try {
    storage?.removeItem(APP_STORAGE_KEY)
  } catch {
    // The caller still receives a clean in-memory seed when storage is blocked.
  }
  return createSeedState()
}

export function exportAppState(state: AppState): string {
  return JSON.stringify(state, null, 2)
}

export function importAppState(json: string): ValidationResult {
  try {
    return validateAppState(JSON.parse(json) as unknown)
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? `Invalid JSON: ${error.message}` : 'Invalid JSON.'] }
  }
}
