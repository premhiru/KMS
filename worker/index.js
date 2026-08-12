const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS memberships (workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN ('owner','organizer','reviewer','speaker')), created_at TEXT NOT NULL, PRIMARY KEY (workspace_id,user_id))`,
  `CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, name TEXT NOT NULL, slug TEXT NOT NULL, cfp_open INTEGER NOT NULL DEFAULT 0 CHECK (cfp_open IN (0,1)), cfp_config TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (workspace_id,slug))`,
  `CREATE TABLE IF NOT EXISTS event_states (event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE, revision INTEGER NOT NULL DEFAULT 1, state_json TEXT NOT NULL, updated_by TEXT NOT NULL REFERENCES users(id), updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS public_submissions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE, title TEXT NOT NULL, abstract TEXT NOT NULL, speaker_name TEXT NOT NULL, speaker_email TEXT NOT NULL, track TEXT NOT NULL DEFAULT '', format TEXT NOT NULL DEFAULT '', consent INTEGER NOT NULL CHECK (consent IN (0,1)), status TEXT NOT NULL DEFAULT 'needs-review' CHECK (status IN ('needs-review','in-review','accepted','waitlisted','declined')), payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_submissions_event_created ON public_submissions(event_id,created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE, object_key TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, uploaded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_assets_event ON assets(event_id,created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, actor_user_id TEXT REFERENCES users(id), action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', request_id TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_workspace_created ON audit_log(workspace_id,created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS rate_limit_buckets (bucket_key TEXT NOT NULL, window_start INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (bucket_key,window_start))`,
  `CREATE TABLE IF NOT EXISTS integration_runs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE, provider TEXT NOT NULL CHECK (provider IN ('resend','accelevents')), action TEXT NOT NULL, idempotency_key TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('running','sent','succeeded','partial','failed')), request_json TEXT NOT NULL DEFAULT '{}', response_json TEXT NOT NULL DEFAULT '{}', error_code TEXT, error_message TEXT, started_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, completed_at TEXT, UNIQUE (workspace_id,event_id,provider,idempotency_key))`,
  `CREATE INDEX IF NOT EXISTS idx_integration_runs_event_created ON integration_runs(workspace_id,event_id,created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS message_deliveries (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES integration_runs(id) ON DELETE CASCADE, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE, idempotency_key TEXT NOT NULL, recipient_speaker_id TEXT NOT NULL, recipient_email TEXT NOT NULL, subject TEXT NOT NULL, provider_message_id TEXT, status TEXT NOT NULL CHECK (status IN ('queued','sent','failed')), error_message TEXT, requested_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (workspace_id,event_id,idempotency_key,recipient_email))`,
  `CREATE INDEX IF NOT EXISTS idx_message_deliveries_event_created ON message_deliveries(workspace_id,event_id,created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS event_state_history (workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE, revision INTEGER NOT NULL, state_json TEXT NOT NULL, updated_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, reason TEXT NOT NULL DEFAULT 'write', PRIMARY KEY (event_id,revision))`,
  `CREATE INDEX IF NOT EXISTS idx_event_state_history_workspace_event ON event_state_history(workspace_id,event_id,revision DESC)`,
  `CREATE TABLE IF NOT EXISTS integration_leases (run_id TEXT PRIMARY KEY REFERENCES integration_runs(id) ON DELETE CASCADE, lease_token TEXT NOT NULL, lease_expires_at TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_integration_leases_expiry ON integration_leases(lease_expires_at)`,
  `CREATE TABLE IF NOT EXISTS integration_object_mappings (workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE, provider TEXT NOT NULL CHECK (provider='accelevents'), object_type TEXT NOT NULL CHECK (object_type IN ('speaker','session')), local_id TEXT NOT NULL, remote_id TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (workspace_id,event_id,provider,object_type,local_id))`,
  `CREATE INDEX IF NOT EXISTS idx_integration_object_remote ON integration_object_mappings(workspace_id,event_id,provider,object_type,remote_id)`,
  `CREATE TABLE IF NOT EXISTS automation_runs (id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE, event_id TEXT REFERENCES events(id) ON DELETE CASCADE, scope_key TEXT NOT NULL DEFAULT 'global', kind TEXT NOT NULL CHECK (kind IN ('reminders','retention')), idempotency_key TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('running','succeeded','partial','failed')), result_json TEXT NOT NULL DEFAULT '{}', error_message TEXT, started_by TEXT, created_at TEXT NOT NULL, completed_at TEXT, UNIQUE (scope_key,kind,idempotency_key))`,
  `CREATE INDEX IF NOT EXISTS idx_automation_runs_event_created ON automation_runs(workspace_id,event_id,created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS automation_leases (run_id TEXT PRIMARY KEY REFERENCES automation_runs(id) ON DELETE CASCADE, lease_token TEXT NOT NULL, lease_expires_at TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_automation_leases_expiry ON automation_leases(lease_expires_at)`,
  `CREATE TABLE IF NOT EXISTS reminder_deliveries (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE, schedule_id TEXT NOT NULL, task_id TEXT NOT NULL, speaker_id TEXT NOT NULL, recipient_email TEXT NOT NULL, idempotency_key TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('queued','sent','failed','skipped')), provider_message_id TEXT, error_message TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (workspace_id,event_id,idempotency_key))`,
  `CREATE INDEX IF NOT EXISTS idx_reminder_deliveries_event_created ON reminder_deliveries(workspace_id,event_id,created_at DESC)`,
]

const MIGRATION_VERSIONS = ['0001_initial', '0002_integrations', '0003_operations', '0004_automation_scopes']
const BASE_MIGRATION_VERSIONS = MIGRATION_VERSIONS.slice(0, 3)

const ROLE_LEVEL = { speaker: 1, reviewer: 2, organizer: 3, owner: 4 }
const ALLOWED_ROLES = new Set(Object.keys(ROLE_LEVEL))
const ALLOWED_ASSET_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain',
])
export const EVENT_STATE_UPSERT_SQL = `INSERT INTO event_states (event_id,revision,state_json,updated_by,updated_at) SELECT ?,1,?,?,? WHERE (?=0 OR EXISTS (SELECT 1 FROM event_states WHERE event_id=? AND revision=?)) AND EXISTS (SELECT 1 FROM events WHERE id=? AND workspace_id=?) ON CONFLICT(event_id) DO UPDATE SET revision=event_states.revision+1,state_json=excluded.state_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at WHERE event_states.revision=? RETURNING revision`
export const CURRENT_STATE_HISTORY_SQL = `INSERT OR IGNORE INTO event_state_history (workspace_id,event_id,revision,state_json,updated_by,created_at,reason) SELECT e.workspace_id,s.event_id,s.revision,s.state_json,s.updated_by,s.updated_at,'pre-migration snapshot' FROM event_states s JOIN events e ON e.id=s.event_id WHERE e.workspace_id=? AND s.event_id=? AND s.revision=?`
export const NEXT_STATE_HISTORY_SQL = `INSERT OR IGNORE INTO event_state_history (workspace_id,event_id,revision,state_json,updated_by,created_at,reason) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM event_states WHERE event_id=? AND revision=? AND updated_by=? AND updated_at=?)`
const schemaPromises = new WeakMap()

export class ApiError extends Error {
  constructor(status, code, message, details, headers) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
    this.headers = headers
  }
}

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`
}

function now() {
  return new Date().toISOString()
}

function validId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,127}$/.test(value)
}

function validUserId(value) {
  return typeof value === 'string' && value.length >= 2 && value.length <= 200 && /^[a-zA-Z0-9][a-zA-Z0-9._:@-]+$/.test(value)
}

function requiredString(value, field, min, max) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new ApiError(422, 'VALIDATION_ERROR', `${field} must contain ${min}–${max} characters.`, { field })
  }
  return value.trim()
}

function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function validateCfpSubmission(body, config = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'INVALID_JSON_BODY', 'A JSON object is required.')
  const title = requiredString(body.title, 'title', 5, 180)
  const abstract = requiredString(body.abstract, 'abstract', 30, Number(config.maxAbstractLength) || 5000)
  const speakerName = requiredString(body.speakerName, 'speakerName', 2, 120)
  if (!validEmail(body.speakerEmail)) throw new ApiError(422, 'VALIDATION_ERROR', 'speakerEmail must be a valid email address.', { field: 'speakerEmail' })
  if (body.consent !== true) throw new ApiError(422, 'CONSENT_REQUIRED', 'Consent is required to submit a proposal.', { field: 'consent' })
  const tracks = Array.isArray(config.tracks) ? config.tracks : []
  const formats = Array.isArray(config.formats) ? config.formats.map((format) => typeof format === 'string' ? format : format?.name).filter(Boolean) : []
  const routingRules = Array.isArray(config.routingRules) ? config.routingRules : Array.isArray(config.categoryRouting) ? config.categoryRouting : []
  const enabledRouting = routingRules.filter((route) => route?.enabled !== false)
  const requestedCategory = typeof body.category === 'string' ? body.category.trim() : ''
  const routing = enabledRouting.find((route) => route?.category === requestedCategory || route?.categoryId === requestedCategory || route?.id === requestedCategory)
  if (enabledRouting.length > 0 && !routing) throw new ApiError(422, 'INVALID_CFP_CATEGORY', 'Select an available proposal category.', { field: 'category' })
  const routedTrack = typeof routing?.track === 'string' ? routing.track.trim() : ''
  const routedFormat = typeof routing?.format === 'string' ? routing.format.trim() : ''
  const track = routedTrack || (typeof body.track === 'string' ? body.track.trim() : '')
  const format = routedFormat || (typeof body.format === 'string' ? body.format.trim() : '')
  if (tracks.length > 0 && !tracks.includes(track)) throw new ApiError(422, 'VALIDATION_ERROR', 'Select an available track.', { field: 'track' })
  if (formats.length > 0 && !formats.includes(format)) throw new ApiError(422, 'VALIDATION_ERROR', 'Select an available format.', { field: 'format' })
  const coSpeakers = body.coSpeakers === undefined ? [] : body.coSpeakers
  if (!Array.isArray(coSpeakers) || coSpeakers.length > 10) throw new ApiError(422, 'VALIDATION_ERROR', 'coSpeakers must contain no more than 10 speakers.', { field: 'coSpeakers' })
  const normalizedCoSpeakers = coSpeakers.map((speaker, index) => {
    if (!speaker || typeof speaker !== 'object' || Array.isArray(speaker)) throw new ApiError(422, 'VALIDATION_ERROR', 'Each co-speaker must be an object.', { field: `coSpeakers.${index}` })
    const name = requiredString(speaker.name || `${speaker.firstName || ''} ${speaker.lastName || ''}`.trim(), `coSpeakers.${index}.name`, 2, 120)
    if (!validEmail(speaker.email)) throw new ApiError(422, 'VALIDATION_ERROR', 'Each co-speaker requires a valid email.', { field: `coSpeakers.${index}.email` })
    return { ...speaker, name, email: speaker.email.trim().toLowerCase() }
  })
  return {
    ...body,
    title, abstract, speakerName, speakerEmail: body.speakerEmail.trim().toLowerCase(), category: routing?.category || requestedCategory, track, format, consent: true,
    coSpeakers: normalizedCoSpeakers,
    customAnswers: (body.customAnswers || body.answers) && typeof (body.customAnswers || body.answers) === 'object' && !Array.isArray(body.customAnswers || body.answers) ? (body.customAnswers || body.answers) : {},
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validIsoDate(value) {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value))
}

function stateEntityArray(state, key, errors, max = 10_000) {
  const value = state[key]
  if (!Array.isArray(value)) {
    errors.push(`${key} must be an array.`)
    return []
  }
  if (value.length > max) errors.push(`${key} may not contain more than ${max} records.`)
  const ids = new Set()
  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`${key}[${index}] must be an object.`)
      return
    }
    if (!validId(entry.id)) errors.push(`${key}[${index}].id is invalid.`)
    else if (ids.has(entry.id)) errors.push(`${key} contains duplicate id "${entry.id}".`)
    else ids.add(entry.id)
  })
  return value.filter(isRecord)
}

function stateString(entry, field, path, errors, max = 5_000, allowEmpty = false) {
  if (typeof entry[field] !== 'string' || entry[field].length > max || (!allowEmpty && entry[field].trim() === '')) errors.push(`${path}.${field} must be ${allowEmpty ? 'a' : 'a non-empty'} string of at most ${max} characters.`)
}

function stateDate(entry, field, path, errors, optional = false) {
  if (entry[field] === undefined && optional) return
  if (!validIsoDate(entry[field])) errors.push(`${path}.${field} must be a valid ISO date-time.`)
}

export function validateAppStateDocument(state, expectedEventId) {
  const errors = []
  if (!isRecord(state)) throw new ApiError(422, 'INVALID_APP_STATE', 'state must be an AppState object.', { errors: ['state must be an object.'] })
  if (state.schemaVersion !== 1) errors.push('schemaVersion must equal 1.')
  stateDate(state, 'lastUpdatedAt', 'state', errors)
  if (!isRecord(state.event)) errors.push('event must be an object.')
  else {
    for (const field of ['id', 'name', 'slug', 'venue', 'timezone', 'startAt', 'endAt']) stateString(state.event, field, 'event', errors, field === 'name' ? 120 : 300)
    if (expectedEventId && state.event.id !== expectedEventId) errors.push('event.id must match the event route identifier.')
    if (typeof state.event.slug === 'string' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(state.event.slug)) errors.push('event.slug must be URL-safe lowercase text.')
    stateDate(state.event, 'startAt', 'event', errors)
    stateDate(state.event, 'endAt', 'event', errors)
    if (validIsoDate(state.event.startAt) && validIsoDate(state.event.endAt) && Date.parse(state.event.endAt) <= Date.parse(state.event.startAt)) errors.push('event.endAt must be after event.startAt.')
    for (const field of ['rooms', 'tracks']) if (!Array.isArray(state.event[field]) || state.event[field].length > 500 || !state.event[field].every((item) => typeof item === 'string' && item.trim() && item.length <= 160)) errors.push(`event.${field} must be an array of no more than 500 non-empty strings.`)
    if (state.event.resources !== undefined && (!Array.isArray(state.event.resources) || state.event.resources.length > 1_000)) errors.push('event.resources must be an array of at most 1000 records.')
    if (state.event.reminderSchedules !== undefined) {
      if (!Array.isArray(state.event.reminderSchedules) || state.event.reminderSchedules.length > 100) errors.push('event.reminderSchedules must be an array of at most 100 records.')
      else state.event.reminderSchedules.forEach((schedule, index) => {
        const path = `event.reminderSchedules[${index}]`
        if (!isRecord(schedule)) return errors.push(`${path} must be an object.`)
        for (const field of ['id', 'name', 'templateId', 'timezone', 'createdAt', 'updatedAt']) stateString(schedule, field, path, errors, 160)
        if (!['accepted', 'confirmed', 'incomplete-onboarding', 'overdue-tasks', 'custom'].includes(schedule.audience)) errors.push(`${path}.audience is invalid.`)
        if (!['once', 'daily', 'weekly'].includes(schedule.cadence)) errors.push(`${path}.cadence is invalid.`)
        if (typeof schedule.enabled !== 'boolean') errors.push(`${path}.enabled must be boolean.`)
        for (const field of ['createdAt', 'updatedAt']) stateDate(schedule, field, path, errors)
        for (const field of ['sendAt', 'nextRunAt', 'lastRunAt']) stateDate(schedule, field, path, errors, true)
        if (schedule.daysBeforeDue !== undefined && (!Number.isSafeInteger(schedule.daysBeforeDue) || schedule.daysBeforeDue < 0 || schedule.daysBeforeDue > 365)) errors.push(`${path}.daysBeforeDue must be an integer from 0 to 365.`)
      })
    }
    if (state.event.accelevents !== undefined) {
      const mapping = state.event.accelevents
      if (!isRecord(mapping)) errors.push('event.accelevents must be an object.')
      else {
        const fields = { sessionTitle: 'title', description: 'abstract', track: 'track', type: 'format', location: 'room', speakers: 'speakers' }
        for (const [field, expected] of Object.entries(fields)) if (mapping[field] !== expected) errors.push(`event.accelevents.${field} must equal "${expected}".`)
        for (const field of ['includeOnlyConfirmedSpeakers', 'includeOnlyPublishedSessions']) if (typeof mapping[field] !== 'boolean') errors.push(`event.accelevents.${field} must be boolean.`)
      }
    }
  }

  const speakers = stateEntityArray(state, 'speakers', errors)
  const submissions = stateEntityArray(state, 'submissions', errors)
  const reviews = stateEntityArray(state, 'reviews', errors)
  const tasks = stateEntityArray(state, 'tasks', errors)
  const sessions = stateEntityArray(state, 'sessions', errors)
  const templates = stateEntityArray(state, 'templates', errors)
  const communicationLog = stateEntityArray(state, 'communicationLog', errors)
  const speakerIds = new Set(speakers.map((entry) => entry.id))
  const submissionIds = new Set(submissions.map((entry) => entry.id))
  const templateIds = new Set(templates.map((entry) => entry.id))

  speakers.forEach((speaker, index) => {
    const path = `speakers[${index}]`
    for (const field of ['firstName', 'lastName', 'company', 'jobTitle', 'bio', 'createdAt', 'updatedAt']) stateString(speaker, field, path, errors, field === 'bio' ? 10_000 : 300, ['lastName', 'company', 'jobTitle', 'bio'].includes(field))
    if (!validEmail(speaker.email)) errors.push(`${path}.email must be valid.`)
    if (!['invited', 'confirmed', 'declined'].includes(speaker.status)) errors.push(`${path}.status is invalid.`)
    if (!Array.isArray(speaker.availability) || speaker.availability.length > 500) errors.push(`${path}.availability must be an array of at most 500 windows.`)
    else speaker.availability.forEach((window, windowIndex) => {
      if (!isRecord(window) || !validIsoDate(window.startAt) || !validIsoDate(window.endAt) || Date.parse(window.endAt) <= Date.parse(window.startAt)) errors.push(`${path}.availability[${windowIndex}] must contain an increasing ISO date-time range.`)
    })
    stateDate(speaker, 'createdAt', path, errors)
    stateDate(speaker, 'updatedAt', path, errors)
  })

  submissions.forEach((submission, index) => {
    const path = `submissions[${index}]`
    const isDraft = submission.lifecycle === 'draft'
    for (const field of ['title', 'abstract', 'track', 'format', 'createdAt', 'updatedAt']) stateString(submission, field, path, errors, field === 'abstract' ? 10_000 : 500, field === 'track' || (isDraft && ['title', 'abstract'].includes(field)))
    if (submission.lifecycle !== undefined && !['draft', 'submitted'].includes(submission.lifecycle)) errors.push(`${path}.lifecycle is invalid.`)
    if (!['needs-review', 'in-review', 'accepted', 'waitlisted', 'declined'].includes(submission.status)) errors.push(`${path}.status is invalid.`)
    if (!Number.isSafeInteger(submission.durationMinutes) || submission.durationMinutes < 5 || submission.durationMinutes > 480) errors.push(`${path}.durationMinutes must be an integer from 5 to 480.`)
    if (!Array.isArray(submission.speakerIds) || submission.speakerIds.length > 20 || !submission.speakerIds.every((speakerId) => speakerIds.has(speakerId))) errors.push(`${path}.speakerIds must reference known speakers.`)
    if (!Array.isArray(submission.tags) || submission.tags.length > 50 || !submission.tags.every((tag) => typeof tag === 'string' && tag.length <= 100)) errors.push(`${path}.tags must be a string array of at most 50 entries.`)
    stateDate(submission, 'createdAt', path, errors)
    stateDate(submission, 'updatedAt', path, errors)
  })

  reviews.forEach((review, index) => {
    const path = `reviews[${index}]`
    for (const field of ['submissionId', 'reviewerName', 'note', 'updatedAt']) stateString(review, field, path, errors, field === 'note' ? 10_000 : 300, field === 'note')
    if (!submissionIds.has(review.submissionId)) errors.push(`${path}.submissionId must reference a known submission.`)
    if (!isRecord(review.scores) || !Object.values(review.scores).every((score) => typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100)) errors.push(`${path}.scores must contain finite values from 0 to 100.`)
    if (review.answers !== undefined && (!isRecord(review.answers) || Object.keys(review.answers).length > 100 || !Object.values(review.answers).every((answer) => (typeof answer === 'string' && answer.length <= 5_000) || (typeof answer === 'number' && Number.isFinite(answer))))) errors.push(`${path}.answers must contain at most 100 short text or numeric values.`)
    stateDate(review, 'updatedAt', path, errors)
  })

  tasks.forEach((task, index) => {
    const path = `tasks[${index}]`
    for (const field of ['speakerId', 'kind', 'title', 'dueAt', 'updatedAt']) stateString(task, field, path, errors, 500)
    if (!speakerIds.has(task.speakerId)) errors.push(`${path}.speakerId must reference a known speaker.`)
    if (!['agreement', 'profile', 'session-details', 'headshot', 'slides', 'supporting-document'].includes(task.kind)) errors.push(`${path}.kind is invalid.`)
    stateDate(task, 'dueAt', path, errors)
    stateDate(task, 'updatedAt', path, errors)
    stateDate(task, 'completedAt', path, errors, true)
    if (task.deliverableVersions !== undefined) {
      if (!Array.isArray(task.deliverableVersions) || task.deliverableVersions.length > 100) errors.push(`${path}.deliverableVersions must contain at most 100 entries.`)
      else {
        const versionIds = new Set()
        let priorVersion = 0
        task.deliverableVersions.forEach((version, versionIndex) => {
          const versionPath = `${path}.deliverableVersions[${versionIndex}]`
          if (!isRecord(version) || typeof version.id !== 'string' || !version.id || versionIds.has(version.id)) errors.push(`${versionPath}.id must be unique.`)
          else versionIds.add(version.id)
          if (!Number.isSafeInteger(version?.version) || version.version <= priorVersion) errors.push(`${versionPath}.version must increase monotonically.`)
          else priorVersion = version.version
          if (!isRecord(version?.asset) || typeof version.asset.id !== 'string' || typeof version.asset.name !== 'string' || typeof version.asset.type !== 'string' || !Number.isSafeInteger(version.asset.size)) errors.push(`${versionPath}.asset is invalid.`)
          if (!validIsoDate(version?.uploadedAt) || typeof version?.uploadedBy !== 'string' || !version.uploadedBy.trim()) errors.push(`${versionPath} upload metadata is invalid.`)
        })
      }
    }
    if (task.comments !== undefined && (!Array.isArray(task.comments) || task.comments.length > 500 || !task.comments.every((comment) => isRecord(comment) && typeof comment.id === 'string' && comment.id && typeof comment.authorName === 'string' && comment.authorName.trim() && ['speaker', 'organizer'].includes(comment.authorRole) && typeof comment.body === 'string' && comment.body.trim() && comment.body.length <= 5_000 && validIsoDate(comment.createdAt)))) errors.push(`${path}.comments is invalid.`)
  })

  sessions.forEach((session, index) => {
    const path = `sessions[${index}]`
    for (const field of ['submissionId', 'room', 'startAt', 'endAt', 'updatedAt']) stateString(session, field, path, errors, 500)
    if (!submissionIds.has(session.submissionId)) errors.push(`${path}.submissionId must reference a known submission.`)
    if (typeof session.published !== 'boolean') errors.push(`${path}.published must be boolean.`)
    stateDate(session, 'startAt', path, errors)
    stateDate(session, 'endAt', path, errors)
    stateDate(session, 'updatedAt', path, errors)
    if (validIsoDate(session.startAt) && validIsoDate(session.endAt) && Date.parse(session.endAt) <= Date.parse(session.startAt)) errors.push(`${path}.endAt must be after startAt.`)
  })

  templates.forEach((template, index) => {
    const path = `templates[${index}]`
    for (const field of ['name', 'subject', 'body', 'audience', 'updatedAt']) stateString(template, field, path, errors, field === 'body' ? 100_000 : 500)
    if (!['accepted', 'confirmed', 'incomplete-onboarding', 'overdue-tasks', 'custom'].includes(template.audience)) errors.push(`${path}.audience is invalid.`)
    if (typeof template.enabled !== 'boolean') errors.push(`${path}.enabled must be boolean.`)
    stateDate(template, 'updatedAt', path, errors)
  })

  communicationLog.forEach((entry, index) => {
    const path = `communicationLog[${index}]`
    for (const field of ['subject', 'body', 'channel', 'status', 'sentAt']) stateString(entry, field, path, errors, field === 'body' ? 100_000 : 500)
    if (!Array.isArray(entry.recipientSpeakerIds) || !entry.recipientSpeakerIds.every((speakerId) => speakerIds.has(speakerId))) errors.push(`${path}.recipientSpeakerIds must reference known speakers.`)
    if (!['in-app-outbox', 'email'].includes(entry.channel)) errors.push(`${path}.channel is invalid.`)
    if (!['queued', 'sent', 'failed'].includes(entry.status)) errors.push(`${path}.status is invalid.`)
    stateDate(entry, 'sentAt', path, errors)
  })

  for (const schedule of state.event?.reminderSchedules || []) if (isRecord(schedule) && !templateIds.has(schedule.templateId)) errors.push(`Reminder schedule "${schedule.id}" references an unknown template.`)
  const plans = state.evaluationPlans === undefined ? [] : stateEntityArray(state, 'evaluationPlans', errors, 1_000)
  const rounds = state.evaluationRounds === undefined ? [] : stateEntityArray(state, 'evaluationRounds', errors, 1_000)
  const assignments = state.evaluationAssignments === undefined ? [] : stateEntityArray(state, 'evaluationAssignments', errors, 20_000)
  const planIds = new Set(plans.map((entry) => entry.id))
  const roundIds = new Set(rounds.map((entry) => entry.id))
  rounds.forEach((round, index) => {
    if (!planIds.has(round.planId)) errors.push(`evaluationRounds[${index}].planId must reference a known plan.`)
    if (!['draft', 'open', 'closed'].includes(round.status)) errors.push(`evaluationRounds[${index}].status is invalid.`)
    if (!Array.isArray(round.rubric) || round.rubric.length < 1 || round.rubric.length > 100) errors.push(`evaluationRounds[${index}].rubric must contain 1 to 100 criteria.`)
    else {
      const criterionIds = new Set()
      round.rubric.forEach((criterion, criterionIndex) => {
        const path = `evaluationRounds[${index}].rubric[${criterionIndex}]`
        const type = criterion?.type || 'rating'
        if (!isRecord(criterion) || typeof criterion.id !== 'string' || !criterion.id || criterionIds.has(criterion.id)) errors.push(`${path}.id must be unique and non-empty.`)
        else criterionIds.add(criterion.id)
        if (!['rating', 'select', 'text'].includes(type)) errors.push(`${path}.type is invalid.`)
        if (typeof criterion?.label !== 'string' || !criterion.label.trim() || criterion.label.length > 200) errors.push(`${path}.label is invalid.`)
        if (typeof criterion?.weight !== 'number' || !Number.isFinite(criterion.weight) || criterion.weight < 0 || criterion.weight > 1000) errors.push(`${path}.weight is invalid.`)
        if (type === 'rating' && (!Number.isSafeInteger(criterion.maxScore) || criterion.maxScore < 2 || criterion.maxScore > 20)) errors.push(`${path}.maxScore must be an integer from 2 to 20.`)
        if (type === 'select' && (!Array.isArray(criterion.options) || criterion.options.length < 2 || criterion.options.length > 50 || !criterion.options.every((option) => typeof option === 'string' && option.trim() && option.length <= 200))) errors.push(`${path}.options must contain 2 to 50 labels.`)
      })
    }
    if (round.opensAt !== undefined && !validIsoDate(round.opensAt)) errors.push(`evaluationRounds[${index}].opensAt must be an ISO date-time.`)
    if (!validIsoDate(round.dueAt)) errors.push(`evaluationRounds[${index}].dueAt must be an ISO date-time.`)
    if (round.opensAt && validIsoDate(round.opensAt) && validIsoDate(round.dueAt) && Date.parse(round.dueAt) <= Date.parse(round.opensAt)) errors.push(`evaluationRounds[${index}] must close after it opens.`)
    if (round.reviewerPool !== undefined && (!Array.isArray(round.reviewerPool) || round.reviewerPool.length > 500 || !round.reviewerPool.every((reviewer) => isRecord(reviewer) && validEmail(reviewer.email) && typeof reviewer.name === 'string' && reviewer.name.length <= 200))) errors.push(`evaluationRounds[${index}].reviewerPool is invalid.`)
  })
  assignments.forEach((assignment, index) => {
    if (!roundIds.has(assignment.roundId)) errors.push(`evaluationAssignments[${index}].roundId must reference a known round.`)
    if (!submissionIds.has(assignment.submissionId)) errors.push(`evaluationAssignments[${index}].submissionId must reference a known submission.`)
    if (!validEmail(assignment.reviewerEmail)) errors.push(`evaluationAssignments[${index}].reviewerEmail must be valid.`)
    if (!['assigned', 'in-progress', 'completed', 'abstained'].includes(assignment.status)) errors.push(`evaluationAssignments[${index}].status is invalid.`)
  })

  if (errors.length) throw new ApiError(422, 'INVALID_APP_STATE', 'The AppState document failed server validation.', { errors: errors.slice(0, 50), errorCount: errors.length })
  return state
}

export function validateStateWrite(body, expectedEventId) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'INVALID_JSON_BODY', 'A JSON object is required.')
  if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) throw new ApiError(422, 'VALIDATION_ERROR', 'expectedRevision must be a non-negative integer.', { field: 'expectedRevision' })
  if (!body.event || typeof body.event !== 'object' || Array.isArray(body.event)) throw new ApiError(422, 'VALIDATION_ERROR', 'event metadata is required.', { field: 'event' })
  const name = requiredString(body.event.name, 'event.name', 2, 120)
  const slug = requiredString(body.event.slug, 'event.slug', 2, 80).toLowerCase()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new ApiError(422, 'VALIDATION_ERROR', 'event.slug must be URL-safe lowercase text.', { field: 'event.slug' })
  const state = validateAppStateDocument(body.state, expectedEventId)
  if (state.event.name !== name || state.event.slug !== slug) throw new ApiError(422, 'INVALID_APP_STATE', 'Event metadata must match state.event.', { errors: ['event.name and event.slug must match state.event.'] })
  return { expectedRevision: body.expectedRevision, event: { name, slug, cfpOpen: body.event.cfpOpen === true, cfpConfig: body.event.cfpConfig ?? {} }, state }
}

async function ensureSchema(env) {
  if (!env.DB) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'The D1 binding DB is not configured.')
  let promise = schemaPromises.get(env.DB)
  if (!promise) {
    const timestamp = now()
    promise = (async () => {
      await env.DB.batch([
        ...SCHEMA_STATEMENTS.map((statement) => env.DB.prepare(statement)),
        ...BASE_MIGRATION_VERSIONS.map((version) => env.DB.prepare(`INSERT OR IGNORE INTO schema_migrations (version,applied_at) VALUES (?,?)`).bind(version, timestamp)),
      ])
      const columns = await env.DB.prepare(`PRAGMA table_info(automation_runs)`).all()
      if (!(columns.results || []).some((column) => column.name === 'scope_key')) {
        try { await env.DB.prepare(`ALTER TABLE automation_runs ADD COLUMN scope_key TEXT NOT NULL DEFAULT 'global'`).run() }
        catch (error) {
          const refreshed = await env.DB.prepare(`PRAGMA table_info(automation_runs)`).all()
          if (!(refreshed.results || []).some((column) => column.name === 'scope_key')) throw error
        }
      }
      await env.DB.batch([
        env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_runs_scope_key ON automation_runs(scope_key,kind,idempotency_key)`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS automation_leases (run_id TEXT PRIMARY KEY REFERENCES automation_runs(id) ON DELETE CASCADE, lease_token TEXT NOT NULL, lease_expires_at TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_automation_leases_expiry ON automation_leases(lease_expires_at)`),
        env.DB.prepare(`INSERT OR IGNORE INTO schema_migrations (version,applied_at) VALUES (?,?)`).bind(MIGRATION_VERSIONS.at(-1), timestamp),
      ])
    })()
    schemaPromises.set(env.DB, promise)
  }
  try {
    await promise
  } catch (error) {
    schemaPromises.delete(env.DB)
    throw error
  }
}

function trustedOrigin(request, env) {
  const origin = request.headers.get('origin')
  if (!origin) return null
  const configured = String(env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean)
  return origin === new URL(request.url).origin || configured.includes(origin) ? origin : null
}

function responseHeaders(request, env, requestId) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Request-Id': requestId,
  })
  const origin = trustedOrigin(request, env)
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Credentials', 'true')
    headers.set('Vary', 'Origin')
  }
  return headers
}

function json(data, status, request, env, requestId, extraHeaders) {
  const headers = responseHeaders(request, env, requestId)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  if (extraHeaders) for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, String(value))
  return new Response(JSON.stringify(data), { status, headers })
}

async function jsonBody(request, maxBytes = 2_000_000) {
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > maxBytes) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `Request body exceeds ${maxBytes} bytes.`)
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `Request body exceeds ${maxBytes} bytes.`)
  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError(400, 'INVALID_JSON_BODY', 'Request body must be valid JSON.')
  }
}

function forwardedIdentity(request, env) {
  const allowAliases = env.ALLOW_LOCAL_AUTH === 'true'
  const userId = request.headers.get('oai-authenticated-user-id') || (allowAliases ? request.headers.get('x-openai-user-id') : null)
  const email = request.headers.get('oai-authenticated-user-email') || (allowAliases ? request.headers.get('x-openai-user-email') : null)
  let name = request.headers.get('oai-authenticated-user-full-name') || (allowAliases ? request.headers.get('x-openai-user-name') : '') || ''
  const nameEncoding = request.headers.get('oai-authenticated-user-full-name-encoding') || request.headers.get('oai-authenticated-user-name-encoding')
  if (name && (nameEncoding || name.includes('%'))) {
    try { name = decodeURIComponent(name) } catch { throw new ApiError(400, 'INVALID_AUTH_HEADER', 'The forwarded user name is not valid percent-encoded text.') }
  }
  if (!userId || !validUserId(userId) || !email || !validEmail(email)) throw new ApiError(401, 'AUTH_REQUIRED', 'Trusted OpenAI authenticated-user forwarding headers are required.')
  return { id: userId, email: email.trim().toLowerCase(), name: name.slice(0, 120) }
}

export const extractForwardedIdentity = forwardedIdentity

async function identityAndMembership(request, env, workspaceId, minimumRole = 'speaker') {
  if (!validId(workspaceId)) throw new ApiError(400, 'INVALID_WORKSPACE_ID', 'Invalid workspace identifier.')
  const user = forwardedIdentity(request, env)
  const timestamp = now()
  await env.DB.prepare(`INSERT INTO users (id,email,name,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,updated_at=excluded.updated_at`).bind(user.id, user.email, user.name, timestamp, timestamp).run()
  const workspace = await env.DB.prepare(`SELECT id FROM workspaces WHERE id=?`).bind(workspaceId).first()
  if (!workspace) {
    const bootstrapEmail = String(env.BOOTSTRAP_OWNER_EMAIL || '').trim().toLowerCase()
    const localBootstrap = env.ALLOW_LOCAL_AUTH === 'true'
    if (!localBootstrap && (!bootstrapEmail || user.email !== bootstrapEmail)) {
      throw new ApiError(403, 'WORKSPACE_NOT_INITIALIZED', 'This workspace must be initialized by its configured bootstrap owner.')
    }
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO workspaces (id,name,created_at) VALUES (?,?,?)`).bind(workspaceId, request.headers.get('x-openspeaker-workspace-name')?.slice(0, 120) || 'OpenSpeaker workspace', timestamp),
      env.DB.prepare(`INSERT OR IGNORE INTO memberships (workspace_id,user_id,role,created_at) SELECT ?,?,'owner',? WHERE NOT EXISTS (SELECT 1 FROM memberships WHERE workspace_id=?)`).bind(workspaceId, user.id, timestamp, workspaceId),
    ])
  }
  let membership = await env.DB.prepare(`SELECT role FROM memberships WHERE workspace_id=? AND user_id=?`).bind(workspaceId, user.id).first()
  if (!membership) {
    const configuredOwnerEmail = String(env.BOOTSTRAP_OWNER_EMAIL || '').trim().toLowerCase()
    if (configuredOwnerEmail && user.email === configuredOwnerEmail) {
      await env.DB.prepare(`INSERT OR IGNORE INTO memberships (workspace_id,user_id,role,created_at) VALUES (?,?,'owner',?)`).bind(workspaceId, user.id, timestamp).run()
      membership = await env.DB.prepare(`SELECT role FROM memberships WHERE workspace_id=? AND user_id=?`).bind(workspaceId, user.id).first()
    }
  }
  if (!membership) throw new ApiError(403, 'WORKSPACE_FORBIDDEN', 'You are not a member of this workspace.')
  if ((ROLE_LEVEL[membership.role] || 0) < ROLE_LEVEL[minimumRole]) throw new ApiError(403, 'ROLE_FORBIDDEN', `${minimumRole} access or higher is required.`)
  return { user, role: membership.role }
}

async function authenticatedUser(request, env) {
  const user = forwardedIdentity(request, env)
  const timestamp = now()
  await env.DB.prepare(`INSERT INTO users (id,email,name,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,updated_at=excluded.updated_at`).bind(user.id, user.email, user.name, timestamp, timestamp).run()
  return user
}

async function audit(env, workspaceId, userId, action, entityType, entityId, metadata, requestId) {
  await env.DB.prepare(`INSERT INTO audit_log (id,workspace_id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(id('audit'), workspaceId, userId || null, action, entityType, entityId, JSON.stringify(metadata || {}), requestId, now()).run()
}

async function sha256(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function enforceSubmissionRateLimit(request, env, workspaceId, eventId) {
  const seconds = Math.max(10, Number(env.CFP_RATE_WINDOW_SECONDS) || 60)
  const limit = Math.max(1, Number(env.CFP_RATE_LIMIT) || 8)
  const epoch = Math.floor(Date.now() / 1000)
  const windowStart = Math.floor(epoch / seconds) * seconds
  const ip = request.headers.get('cf-connecting-ip') || 'unknown'
  const bucketKey = await sha256(`${workspaceId}:${eventId}:${ip}`)
  const result = await env.DB.prepare(`INSERT INTO rate_limit_buckets (bucket_key,window_start,count) VALUES (?,?,1) ON CONFLICT(bucket_key,window_start) DO UPDATE SET count=count+1 RETURNING count`).bind(bucketKey, windowStart).first()
  if (Number(result?.count) > limit) {
    const retryAfter = Math.max(1, windowStart + seconds - epoch)
    throw new ApiError(429, 'RATE_LIMITED', 'Too many submissions. Please try again shortly.', { retryAfterSeconds: retryAfter }, { 'Retry-After': retryAfter })
  }
}

function parseJsonColumn(value, fallback) {
  try { return JSON.parse(value) } catch { return fallback }
}

function splitName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean)
  return { firstName: parts.shift() || 'Speaker', lastName: parts.join(' ') }
}

export function mergePublicSubmissionsIntoState(state, rows) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return { state, importedCount: 0 }
  const merged = {
    ...state,
    speakers: Array.isArray(state.speakers) ? [...state.speakers] : [],
    submissions: Array.isArray(state.submissions) ? [...state.submissions] : [],
  }
  const knownSourceIds = new Set(merged.submissions.map((submission) => submission?.sourceSubmissionId || submission?.source?.publicSubmissionId).filter(Boolean))
  const deletedSourceIds = new Set(Array.isArray(state.deletedSourceSubmissionIds) ? state.deletedSourceSubmissionIds : [])
  const knownSubmissionIds = new Set(merged.submissions.map((submission) => submission?.id))
  const speakerByEmail = new Map(merged.speakers.filter((speaker) => typeof speaker?.email === 'string').map((speaker) => [speaker.email.trim().toLowerCase(), speaker]))
  let importedCount = 0

  for (const row of rows || []) {
    if (!row?.id || deletedSourceIds.has(row.id)) continue
    const existingIndex = merged.submissions.findIndex((submission) => submission?.sourceSubmissionId === row.id || submission?.source?.publicSubmissionId === row.id || submission?.id === `cfp-${row.id}`)
    if (existingIndex >= 0) {
      const existing = merged.submissions[existingIndex]
      if (row.status && (existing.status !== row.status || existing.updatedAt !== row.updated_at)) merged.submissions[existingIndex] = { ...existing, status: row.status, updatedAt: row.updated_at }
      knownSourceIds.add(row.id)
      continue
    }
    if (knownSourceIds.has(row.id) || knownSubmissionIds.has(`cfp-${row.id}`)) continue
    const payload = parseJsonColumn(row.payload_json, {})
    const people = [{
      name: row.speaker_name,
      email: row.speaker_email,
      company: payload.company || payload.speakerCompany,
      jobTitle: payload.jobTitle || payload.speakerJobTitle,
      bio: payload.bio || payload.speakerBio,
    }, ...(Array.isArray(payload.coSpeakers) ? payload.coSpeakers : [])]
    const speakerIds = []
    for (const [personIndex, person] of people.entries()) {
      const email = String(person?.email || '').trim().toLowerCase()
      if (!validEmail(email)) continue
      let speaker = speakerByEmail.get(email)
      if (!speaker) {
        const names = splitName(person.name)
        const speakerId = `speaker-cfp-${row.id}-${personIndex}`
        speaker = {
          id: speakerId, ...names, email, company: String(person.company || ''), jobTitle: String(person.jobTitle || ''),
          bio: String(person.bio || ''), status: 'invited', availability: [], createdAt: row.created_at, updatedAt: row.updated_at,
          source: 'public-cfp', sourceSubmissionId: row.id,
        }
        merged.speakers.push(speaker)
        speakerByEmail.set(email, speaker)
      }
      speakerIds.push(speaker.id)
    }
    const duration = Number(payload.durationMinutes)
    const submission = {
      id: `cfp-${row.id}`,
      title: row.title,
      abstract: row.abstract,
      track: row.track || payload.track || '',
      format: row.format || payload.format || 'Talk',
      durationMinutes: Number.isSafeInteger(duration) && duration >= 5 && duration <= 480 ? duration : 30,
      speakerIds: [...new Set(speakerIds)],
      status: row.status || 'needs-review',
      tags: Array.isArray(payload.tags) ? payload.tags.filter((tag) => typeof tag === 'string').slice(0, 20) : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      source: 'public-cfp',
      origin: 'cfp',
      cfpVersion: Number.isSafeInteger(Number(payload.cfpVersion)) ? Number(payload.cfpVersion) : 1,
      sourceSubmissionId: row.id,
      sourcePayload: payload,
      customAnswers: payload.customAnswers && typeof payload.customAnswers === 'object' ? payload.customAnswers : {},
      importedAt: row.created_at,
    }
    merged.submissions.push(submission)
    knownSourceIds.add(row.id)
    knownSubmissionIds.add(submission.id)
    importedCount += 1
  }
  if (importedCount > 0) {
    const latest = rows.map((row) => row.updated_at).filter(Boolean).sort().at(-1)
    if (latest && (!merged.lastUpdatedAt || latest > merged.lastUpdatedAt)) merged.lastUpdatedAt = latest
  }
  return { state: merged, importedCount }
}

async function sendCfpConfirmation(env, event, input, submissionId) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return { status: 'skipped', reason: 'provider-not-configured' }
  try {
    const response = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `cfp-confirmation-${submissionId}` },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [input.speakerEmail], subject: `${event.name}: proposal received`, text: `Hi ${input.speakerName},\n\nWe received “${input.title}” for ${event.name}. Its current status is Submitted.\n\nReference: ${submissionId}` }),
    }, env)
    const payload = await providerPayload(response)
    if (!response.ok) return { status: 'failed', providerMessage: payload.message || `HTTP ${response.status}` }
    return { status: 'sent', providerMessageId: payload.id || null }
  } catch (error) {
    return { status: 'failed', providerMessage: error instanceof Error ? error.message.slice(0, 500) : 'Confirmation delivery failed.' }
  }
}

async function publicCfp(request, env, requestId, workspaceId, eventSlug) {
  const event = await env.DB.prepare(`SELECT e.id,e.name,e.slug,e.cfp_config,s.revision,s.state_json FROM events e LEFT JOIN event_states s ON s.event_id=e.id WHERE e.workspace_id=? AND e.slug=? AND e.cfp_open=1`).bind(workspaceId, eventSlug).first()
  if (!event) throw new ApiError(404, 'CFP_NOT_FOUND', 'This call for proposals is unavailable or closed.')
  if (request.method === 'GET') {
    const config = parseJsonColumn(event.cfp_config, {})
    const publicState = event.state_json ? sanitizePublicState(parseJsonColumn(event.state_json, {})) : null
    if (publicState?.event) publicState.event = { ...publicState.event, cfp: config }
    return json({ data: { event: { id: event.id, name: event.name, slug: event.slug }, config, revision: event.revision || 0, state: publicState } }, 200, request, env, requestId)
  }
  if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'GET, POST' })
  const config = parseJsonColumn(event.cfp_config, {})
  if (config.closeAt && Number.isFinite(Date.parse(config.closeAt)) && Date.now() >= Date.parse(config.closeAt)) throw new ApiError(410, 'CFP_CLOSED', 'This call for proposals has closed.', { closeAt: config.closeAt })
  await enforceSubmissionRateLimit(request, env, workspaceId, event.id)
  const input = { ...validateCfpSubmission(await jsonBody(request, 100_000), config), cfpVersion: Number.isSafeInteger(Number(config.version)) ? Number(config.version) : 1 }
  const questions = Array.isArray(config.questions) ? config.questions : Array.isArray(config.customQuestions) ? config.customQuestions : []
  const answers = input.customAnswers || {}
  for (const question of questions) {
    const conditions = [
      ...(Array.isArray(question.conditions) ? question.conditions : question.condition ? [question.condition] : []),
      ...(question.showWhen ? [question.showWhen] : []),
    ]
    const visible = conditions.every((condition) => {
      if (!condition || typeof condition !== 'object') return true
      if (condition.field) {
        const actual = condition.field === 'track' ? input.track : condition.field === 'format' ? input.format : answers[condition.field]
        const expected = condition.equals ?? condition.value
        return condition.operator === 'notEquals' ? actual !== expected : actual === expected
      }
      return Object.entries(condition).every(([field, expected]) => (field === 'track' ? input.track : field === 'format' ? input.format : answers[field]) === expected)
    })
    const answer = answers[question.id || question.key]
    const missing = answer === undefined || answer === null || answer === '' || (Array.isArray(answer) && answer.length === 0)
    if (visible && question.required === true && missing) throw new ApiError(422, 'REQUIRED_QUESTION_MISSING', 'A required CFP question is missing.', { questionId: question.id || question.key })
  }
  const perSpeakerLimit = config.allowMultiple === true ? Math.max(1, Number(config.submissionLimit) || 25) : 1
  const submissionId = id('submission')
  const timestamp = now()
  const inserted = await env.DB.prepare(`INSERT INTO public_submissions (id,workspace_id,event_id,title,abstract,speaker_name,speaker_email,track,format,consent,status,payload_json,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,1,'needs-review',?,?,? WHERE (SELECT COUNT(*) FROM public_submissions WHERE event_id=? AND lower(speaker_email)=?) < ?`).bind(submissionId, workspaceId, event.id, input.title, input.abstract, input.speakerName, input.speakerEmail, input.track, input.format, JSON.stringify(input), timestamp, timestamp, event.id, input.speakerEmail, perSpeakerLimit).run()
  if (Number(inserted?.meta?.changes ?? inserted?.changes ?? 0) < 1) throw new ApiError(409, 'SUBMISSION_LIMIT_REACHED', 'This speaker has reached the proposal limit for this event.', { limit: perSpeakerLimit, allowMultiple: config.allowMultiple === true })
  await audit(env, workspaceId, null, 'cfp.submitted', 'submission', submissionId, { eventId: event.id }, requestId)
  const confirmationEmail = await sendCfpConfirmation(env, event, input, submissionId)
  await audit(env, workspaceId, null, `cfp.confirmation.${confirmationEmail.status}`, 'submission', submissionId, { eventId: event.id, providerMessageId: confirmationEmail.providerMessageId, providerMessage: confirmationEmail.providerMessage }, requestId)
  return json({ data: { id: submissionId, status: 'needs-review', submittedAt: timestamp, confirmationEmail } }, 201, request, env, requestId)
}

export function sanitizePublicState(state, workspaceId, eventSlug) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return {}
  const submissions = Array.isArray(state.submissions) ? state.submissions.filter((submission) => submission?.status === 'accepted') : []
  const acceptedIds = new Set(submissions.map((submission) => submission.id))
  const sessions = Array.isArray(state.sessions) ? state.sessions.filter((session) => session?.published === true && acceptedIds.has(session.submissionId)) : []
  const publishedSubmissionIds = new Set(sessions.map((session) => session.submissionId))
  const publicSubmissions = submissions.filter((submission) => publishedSubmissionIds.has(submission.id))
  const speakerIds = new Set(publicSubmissions.flatMap((submission) => Array.isArray(submission.speakerIds) ? submission.speakerIds : []))
  const approvedHeadshots = new Map((state.tasks || []).filter((task) => task?.kind === 'headshot' && task.completedAt && task.approvalStatus === 'approved' && task.asset?.id).map((task) => [task.speakerId, task.asset.id]))
  const speakers = Array.isArray(state.speakers) ? state.speakers.filter((speaker) => speaker?.status === 'confirmed' && speakerIds.has(speaker.id)).map((speaker) => ({
    id: speaker.id, firstName: speaker.firstName, lastName: speaker.lastName, company: speaker.company, jobTitle: speaker.jobTitle,
    bio: speaker.bio, pronouns: speaker.pronouns,
    photoUrl: approvedHeadshots.has(speaker.id) && workspaceId && eventSlug
      ? `/api/public/events/${encodeURIComponent(workspaceId)}/${encodeURIComponent(eventSlug)}/speakers/${encodeURIComponent(speaker.id)}/headshot`
      : typeof speaker.photoUrl === 'string' && /^https:\/\//i.test(speaker.photoUrl) ? speaker.photoUrl : undefined,
    status: speaker.status,
    email: '', availability: [], createdAt: speaker.createdAt, updatedAt: speaker.updatedAt,
  })) : []
  let publicEvent = state.event
  if (state.event && typeof state.event === 'object') {
    const { resources: _resources, cfp: _cfp, ...safeEvent } = state.event
    publicEvent = safeEvent
  }
  return { schemaVersion: state.schemaVersion, lastUpdatedAt: state.lastUpdatedAt, event: publicEvent, speakers, submissions: publicSubmissions, sessions, reviews: [], tasks: [], templates: [], communicationLog: [] }
}

async function publicEventState(request, env, requestId, workspaceId, eventSlug) {
  if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'GET' })
  const row = await env.DB.prepare(`SELECT e.id,e.name,e.slug,s.revision,s.state_json,s.updated_at FROM events e JOIN event_states s ON s.event_id=e.id WHERE e.workspace_id=? AND e.slug=?`).bind(workspaceId, eventSlug).first()
  if (!row) throw new ApiError(404, 'PUBLIC_EVENT_NOT_FOUND', 'Published event state was not found.')
  return json({ data: { event: { id: row.id, name: row.name, slug: row.slug }, revision: row.revision, state: sanitizePublicState(parseJsonColumn(row.state_json, {}), workspaceId, eventSlug), updatedAt: row.updated_at } }, 200, request, env, requestId, { ETag: `"${row.revision}"` })
}

async function workspaceEvents(request, env, requestId, workspaceId) {
  const access = await identityAndMembership(request, env, workspaceId, 'organizer')
  if (request.method === 'GET') {
    const rows = await env.DB.prepare(`SELECT e.id,e.name,e.slug,e.created_at,e.updated_at,s.revision,s.state_json FROM events e LEFT JOIN event_states s ON s.event_id=e.id WHERE e.workspace_id=? ORDER BY e.created_at DESC`).bind(workspaceId).all()
    const events = (rows.results || []).map((row) => {
      const state = parseJsonColumn(row.state_json, {})
      return { id: row.id, name: row.name, slug: row.slug, startAt: state.event?.startAt || null, endAt: state.event?.endAt || null, revision: Number(row.revision || 0), createdAt: row.created_at, updatedAt: row.updated_at }
    })
    return json({ data: { events } }, 200, request, env, requestId)
  }
  if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'GET, POST' })
  const body = await jsonBody(request, 1_000_000)
  if (!isRecord(body.state) || !isRecord(body.state.event)) throw new ApiError(422, 'VALIDATION_ERROR', 'state with event configuration is required.', { field: 'state' })
  const eventId = typeof body.state.event.id === 'string' && body.state.event.id.trim() ? body.state.event.id.trim() : id('event')
  const state = { ...body.state, event: { ...body.state.event, id: eventId } }
  validateAppStateDocument(state, eventId)
  const name = requiredString(state.event.name, 'state.event.name', 2, 120)
  const slug = requiredString(state.event.slug, 'state.event.slug', 2, 80).toLowerCase()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new ApiError(422, 'VALIDATION_ERROR', 'state.event.slug must be URL-safe lowercase text.', { field: 'state.event.slug' })
  const duplicate = await env.DB.prepare(`SELECT id FROM events WHERE workspace_id=? AND (id=? OR slug=?)`).bind(workspaceId, eventId, slug).first()
  if (duplicate) throw new ApiError(409, 'EVENT_ALREADY_EXISTS', 'An event with this id or slug already exists.', { eventId: duplicate.id, slug })
  const timestamp = now()
  const cfpConfig = isRecord(state.event.cfp) ? state.event.cfp : {}
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO events (id,workspace_id,name,slug,cfp_open,cfp_config,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`).bind(eventId, workspaceId, name, slug, cfpConfig.open === true ? 1 : 0, JSON.stringify(cfpConfig), timestamp, timestamp),
    env.DB.prepare(`INSERT INTO event_states (event_id,revision,state_json,updated_by,updated_at) VALUES (?,1,?,?,?)`).bind(eventId, JSON.stringify(state), access.user.id, timestamp),
    env.DB.prepare(`INSERT INTO event_state_history (workspace_id,event_id,revision,state_json,updated_by,created_at,reason) VALUES (?,?,1,?,?,?,'event created')`).bind(workspaceId, eventId, JSON.stringify(state), access.user.id, timestamp),
  ])
  await audit(env, workspaceId, access.user.id, 'event.created', 'event', eventId, { name, slug, revision: 1 }, requestId)
  return json({ data: { event: { id: eventId, name, slug, startAt: state.event.startAt, endAt: state.event.endAt, revision: 1, createdAt: timestamp, updatedAt: timestamp } } }, 201, request, env, requestId, { ETag: '"1"' })
}

async function publicSpeakerHeadshot(request, env, requestId, workspaceId, eventSlug, speakerId) {
  if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'GET' })
  if (!env.FILES) throw new ApiError(503, 'FILES_UNAVAILABLE', 'The R2 binding FILES is not configured.')
  const row = await env.DB.prepare(`SELECT e.id,s.state_json FROM events e JOIN event_states s ON s.event_id=e.id WHERE e.workspace_id=? AND e.slug=?`).bind(workspaceId, eventSlug).first()
  if (!row) throw new ApiError(404, 'PUBLIC_EVENT_NOT_FOUND', 'Published event state was not found.')
  const state = parseJsonColumn(row.state_json, {})
  const publicState = sanitizePublicState(state, workspaceId, eventSlug)
  if (!(publicState.speakers || []).some((speaker) => speaker.id === speakerId)) throw new ApiError(404, 'PUBLIC_HEADSHOT_NOT_FOUND', 'An approved public headshot was not found.')
  const task = (state.tasks || []).find((item) => item?.speakerId === speakerId && item.kind === 'headshot' && item.completedAt && item.approvalStatus === 'approved' && item.asset?.id)
  if (!task) throw new ApiError(404, 'PUBLIC_HEADSHOT_NOT_FOUND', 'An approved public headshot was not found.')
  const asset = await env.DB.prepare(`SELECT object_key,file_name,content_type,size_bytes FROM assets WHERE id=? AND workspace_id=? AND event_id=?`).bind(task.asset.id, workspaceId, row.id).first()
  if (!asset || !['image/jpeg', 'image/png', 'image/webp'].includes(asset.content_type)) throw new ApiError(404, 'PUBLIC_HEADSHOT_NOT_FOUND', 'An approved public headshot was not found.')
  const object = await env.FILES.get(asset.object_key)
  if (!object) throw new ApiError(404, 'ASSET_BYTES_NOT_FOUND', 'Headshot metadata exists but its object is missing.')
  const headers = responseHeaders(request, env, requestId)
  headers.set('Content-Type', asset.content_type)
  headers.set('Content-Length', String(asset.size_bytes))
  headers.set('Content-Disposition', `inline; filename="${safeFileName(asset.file_name)}"`)
  headers.set('Cache-Control', 'public, max-age=300')
  if (object.httpEtag) headers.set('ETag', object.httpEtag)
  return new Response(object.body, { headers })
}

function sourceStatusStatements(env, state, workspaceId, eventId, timestamp) {
  return (state.submissions || []).filter((submission) => submission?.sourceSubmissionId && ['needs-review', 'in-review', 'accepted', 'waitlisted', 'declined'].includes(submission.status)).slice(0, 10_000).map((submission) => env.DB.prepare(`UPDATE public_submissions SET status=?,updated_at=? WHERE id=? AND workspace_id=? AND event_id=? AND status<>?`).bind(submission.status, timestamp, submission.sourceSubmissionId, workspaceId, eventId, submission.status))
}

function nextHistoryStatement(env, workspaceId, eventId, revision, state, userId, timestamp, reason) {
  return env.DB.prepare(NEXT_STATE_HISTORY_SQL).bind(workspaceId, eventId, revision, JSON.stringify(state), userId, timestamp, reason, eventId, revision, userId, timestamp)
}

async function persistStateRevision(env, { workspaceId, eventId, state, expectedRevision, userId, timestamp, reason }) {
  const revision = expectedRevision + 1
  const results = await env.DB.batch([
    env.DB.prepare(CURRENT_STATE_HISTORY_SQL).bind(workspaceId, eventId, expectedRevision),
    env.DB.prepare(EVENT_STATE_UPSERT_SQL).bind(eventId, JSON.stringify(state), userId, timestamp, expectedRevision, eventId, expectedRevision, eventId, workspaceId, expectedRevision),
    nextHistoryStatement(env, workspaceId, eventId, revision, state, userId, timestamp, reason),
    ...sourceStatusStatements(env, state, workspaceId, eventId, timestamp),
  ])
  return results[1]?.results?.[0] || null
}

async function eventStateHistory(request, env, requestId, workspaceId, eventId, revisionValue) {
  await identityAndMembership(request, env, workspaceId, 'organizer')
  if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'GET' })
  const current = await env.DB.prepare(`SELECT s.revision FROM event_states s JOIN events e ON e.id=s.event_id WHERE e.workspace_id=? AND s.event_id=?`).bind(workspaceId, eventId).first()
  if (!current) throw new ApiError(404, 'EVENT_STATE_NEEDS_SEED', 'Event state has not been initialized.')
  await env.DB.prepare(CURRENT_STATE_HISTORY_SQL).bind(workspaceId, eventId, current.revision).run()
  if (revisionValue !== undefined) {
    const revision = Number(revisionValue)
    if (!Number.isSafeInteger(revision) || revision < 1) throw new ApiError(400, 'INVALID_REVISION', 'Revision must be a positive integer.')
    const snapshot = await env.DB.prepare(`SELECT revision,state_json,updated_by,created_at,reason FROM event_state_history WHERE workspace_id=? AND event_id=? AND revision=?`).bind(workspaceId, eventId, revision).first()
    if (!snapshot) throw new ApiError(404, 'STATE_REVISION_NOT_FOUND', 'That state revision is not available.')
    return json({ data: { eventId, revision: snapshot.revision, state: parseJsonColumn(snapshot.state_json, {}), updatedBy: snapshot.updated_by, createdAt: snapshot.created_at, reason: snapshot.reason } }, 200, request, env, requestId, { ETag: `"${snapshot.revision}"` })
  }
  const snapshots = await env.DB.prepare(`SELECT revision,updated_by,created_at,reason,length(state_json) AS size_bytes FROM event_state_history WHERE workspace_id=? AND event_id=? ORDER BY revision DESC LIMIT 200`).bind(workspaceId, eventId).all()
  return json({ data: { eventId, currentRevision: current.revision, revisions: snapshots.results || [] } }, 200, request, env, requestId)
}

async function rollbackEventState(request, env, requestId, workspaceId, eventId) {
  const access = await identityAndMembership(request, env, workspaceId, 'organizer')
  if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'POST' })
  const body = await jsonBody(request, 50_000)
  if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1 || !Number.isSafeInteger(body.targetRevision) || body.targetRevision < 1) throw new ApiError(422, 'VALIDATION_ERROR', 'expectedRevision and targetRevision must be positive integers.')
  const snapshot = await env.DB.prepare(`SELECT state_json FROM event_state_history WHERE workspace_id=? AND event_id=? AND revision=?`).bind(workspaceId, eventId, body.targetRevision).first()
  if (!snapshot) throw new ApiError(404, 'STATE_REVISION_NOT_FOUND', 'The requested rollback revision is unavailable.')
  const state = validateAppStateDocument(parseJsonColumn(snapshot.state_json, null), eventId)
  const reasonText = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 500) : `Rollback to revision ${body.targetRevision}`
  const timestamp = now()
  const newRevision = body.expectedRevision + 1
  const eventUpdate = env.DB.prepare(`UPDATE events SET name=?,slug=?,cfp_open=?,cfp_config=?,updated_at=? WHERE id=? AND workspace_id=? AND EXISTS (SELECT 1 FROM event_states WHERE event_id=? AND revision=?) RETURNING id`).bind(state.event.name, state.event.slug, state.event.cfp?.open === true ? 1 : 0, JSON.stringify(state.event.cfp || {}), timestamp, eventId, workspaceId, eventId, body.expectedRevision)
  let results
  try {
    results = await env.DB.batch([
      env.DB.prepare(CURRENT_STATE_HISTORY_SQL).bind(workspaceId, eventId, body.expectedRevision),
      eventUpdate,
      env.DB.prepare(EVENT_STATE_UPSERT_SQL).bind(eventId, JSON.stringify(state), access.user.id, timestamp, body.expectedRevision, eventId, body.expectedRevision, eventId, workspaceId, body.expectedRevision),
      nextHistoryStatement(env, workspaceId, eventId, newRevision, state, access.user.id, timestamp, `rollback:${body.targetRevision}:${reasonText}`),
      ...sourceStatusStatements(env, state, workspaceId, eventId, timestamp),
    ])
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new ApiError(409, 'EVENT_SLUG_CONFLICT', 'The historical event slug is already in use.')
    throw error
  }
  const updated = results[2]?.results?.[0]
  if (!updated || !results[1]?.results?.[0]) throw new ApiError(409, 'REVISION_CONFLICT', 'Event state changed before rollback could be applied.', { expectedRevision: body.expectedRevision })
  await audit(env, workspaceId, access.user.id, 'event.state.rolled_back', 'event', eventId, { targetRevision: body.targetRevision, revision: updated.revision, reason: reasonText }, requestId)
  return json({ data: { eventId, revision: updated.revision, rolledBackFrom: body.expectedRevision, targetRevision: body.targetRevision, updatedAt: timestamp } }, 200, request, env, requestId, { ETag: `"${updated.revision}"` })
}

async function eventState(request, env, requestId, workspaceId, eventId) {
  const access = await identityAndMembership(request, env, workspaceId, 'organizer')
  if (!validId(eventId)) throw new ApiError(400, 'INVALID_EVENT_ID', 'Invalid event identifier.')
  if (request.method === 'GET') {
    const row = await env.DB.prepare(`SELECT e.id,e.name,e.slug,e.cfp_open,e.cfp_config,s.revision,s.state_json,s.updated_at FROM events e JOIN event_states s ON s.event_id=e.id WHERE e.id=? AND e.workspace_id=?`).bind(eventId, workspaceId).first()
    if (!row) throw new ApiError(404, 'EVENT_STATE_NEEDS_SEED', 'Event state has not been initialized. PUT the current local AppState with expectedRevision 0.', { eventId, expectedRevision: 0, canSeed: true })
    const pending = await env.DB.prepare(`SELECT id,title,abstract,speaker_name,speaker_email,track,format,status,payload_json,created_at,updated_at FROM public_submissions WHERE workspace_id=? AND event_id=? ORDER BY created_at`).bind(workspaceId, eventId).all()
    const ingestion = mergePublicSubmissionsIntoState(parseJsonColumn(row.state_json, {}), pending.results || [])
    return json({ data: { event: { id: row.id, name: row.name, slug: row.slug, cfpOpen: Boolean(row.cfp_open), cfpConfig: parseJsonColumn(row.cfp_config, {}) }, revision: row.revision, state: ingestion.state, ingestion: { source: 'public-cfp', importedCount: ingestion.importedCount, sourceRecordCount: pending.results?.length || 0 }, updatedAt: row.updated_at } }, 200, request, env, requestId, { ETag: `"${row.revision}"` })
  }
  if (request.method !== 'PUT') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'GET, PUT' })
  const input = validateStateWrite(await jsonBody(request), eventId)
  const timestamp = now()
  const eventQuery = env.DB.prepare(`INSERT INTO events (id,workspace_id,name,slug,cfp_open,cfp_config,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE (?=0 AND NOT EXISTS (SELECT 1 FROM event_states WHERE event_id=?)) OR EXISTS (SELECT 1 FROM event_states WHERE event_id=? AND revision=?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,cfp_open=excluded.cfp_open,cfp_config=excluded.cfp_config,updated_at=excluded.updated_at WHERE events.workspace_id=excluded.workspace_id AND ((?=0 AND NOT EXISTS (SELECT 1 FROM event_states WHERE event_id=excluded.id)) OR EXISTS (SELECT 1 FROM event_states WHERE event_id=excluded.id AND revision=?)) RETURNING id`).bind(eventId, workspaceId, input.event.name, input.event.slug, input.event.cfpOpen ? 1 : 0, JSON.stringify(input.event.cfpConfig), timestamp, timestamp, input.expectedRevision, eventId, eventId, input.expectedRevision, input.expectedRevision, input.expectedRevision)
  const stateQuery = env.DB.prepare(EVENT_STATE_UPSERT_SQL).bind(eventId, JSON.stringify(input.state), access.user.id, timestamp, input.expectedRevision, eventId, input.expectedRevision, eventId, workspaceId, input.expectedRevision)
  let results
  try {
    const revision = input.expectedRevision + 1
    results = await env.DB.batch([
      eventQuery,
      env.DB.prepare(CURRENT_STATE_HISTORY_SQL).bind(workspaceId, eventId, input.expectedRevision),
      stateQuery,
      nextHistoryStatement(env, workspaceId, eventId, revision, input.state, access.user.id, timestamp, 'organizer write'),
      ...sourceStatusStatements(env, input.state, workspaceId, eventId, timestamp),
    ])
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new ApiError(409, 'EVENT_SLUG_CONFLICT', 'That event slug is already in use in this workspace.')
    throw error
  }
  const revision = results[2]?.results?.[0]?.revision
  if (!revision || !results[0]?.results?.[0]) {
    const current = await env.DB.prepare(`SELECT s.revision FROM event_states s JOIN events e ON e.id=s.event_id WHERE s.event_id=? AND e.workspace_id=?`).bind(eventId, workspaceId).first()
    throw new ApiError(409, 'REVISION_CONFLICT', 'Event state has changed since it was loaded.', { expectedRevision: input.expectedRevision, currentRevision: current?.revision ?? 0 })
  }
  await audit(env, workspaceId, access.user.id, 'event.state.updated', 'event', eventId, { revision }, requestId)
  return json({ data: { eventId, revision, updatedAt: timestamp } }, input.expectedRevision === 0 ? 201 : 200, request, env, requestId, { ETag: `"${revision}"` })
}

async function workspaceSession(request, env, requestId, workspaceId) {
  if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'GET' })
  const access = await identityAndMembership(request, env, workspaceId, 'speaker')
  return json({ data: { user: access.user, role: access.role } }, 200, request, env, requestId)
}

async function reviewerQueue(request, env, requestId, workspaceId, eventId) {
  const access = await identityAndMembership(request, env, workspaceId, 'reviewer')
  if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'GET' })
  const loaded = await loadedEventState(env, workspaceId, eventId)
  const assignments = (Array.isArray(loaded.state.evaluationAssignments) ? loaded.state.evaluationAssignments : []).filter((assignment) => assignmentReviewerEmail(assignment) === access.user.email)
  const rounds = Array.isArray(loaded.state.evaluationRounds) ? loaded.state.evaluationRounds : []
  const assignmentBySubmission = new Map(assignments.map((assignment) => [assignment.submissionId, assignment]))
  const submissions = (loaded.state.submissions || []).filter((submission) => assignmentBySubmission.has(submission.id)).map((submission) => {
    const assignment = assignmentBySubmission.get(submission.id)
    const blind = assignment.blind === true || rounds.find((round) => round.id === assignment.roundId)?.blind === true
    return blind ? { ...submission, speakerIds: [], sourcePayload: undefined, customAnswers: undefined } : submission
  })
  const visibleSpeakerIds = new Set(submissions.flatMap((submission) => submission.speakerIds || []))
  const speakers = (loaded.state.speakers || []).filter((speaker) => visibleSpeakerIds.has(speaker.id))
  const reviews = (loaded.state.reviews || []).filter((review) => review.reviewerEmail === access.user.email || review.reviewerUserId === access.user.id)
  const roundIds = new Set(assignments.map((assignment) => assignment.roundId).filter(Boolean))
  const visibleRounds = rounds.filter((round) => roundIds.has(round.id)).map(({ id: roundId, planId, name, rubric, instructions, status, opensAt, dueAt, blind }) => ({ id: roundId, planId, name, rubric, instructions, status, opensAt, dueAt, blind }))
  const planIds = new Set([...assignments.map((assignment) => assignment.planId), ...visibleRounds.map((round) => round.planId)].filter(Boolean))
  const plans = (Array.isArray(loaded.state.evaluationPlans) ? loaded.state.evaluationPlans : []).filter((plan) => planIds.has(plan.id)).map(({ id: planId, name, label }) => ({ id: planId, name, label }))
  return json({ data: { revision: loaded.row.revision, event: loaded.state.event, assignments, rounds: visibleRounds, plans, submissions, speakers, reviews } }, 200, request, env, requestId, { ETag: `"${loaded.row.revision}"` })
}

async function members(request, env, requestId, workspaceId, memberUserId) {
  const access = await identityAndMembership(request, env, workspaceId, request.method === 'GET' ? 'organizer' : 'owner')
  if (request.method === 'GET' && !memberUserId) {
    const result = await env.DB.prepare(`SELECT u.id,u.email,u.name,m.role,m.created_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY m.created_at`).bind(workspaceId).all()
    return json({ data: result.results || [] }, 200, request, env, requestId)
  }
  if (request.method === 'POST' && !memberUserId) {
    const body = await jsonBody(request, 20_000)
    if (!validId(body.userId) || !validEmail(body.email) || !ALLOWED_ROLES.has(body.role)) throw new ApiError(422, 'VALIDATION_ERROR', 'userId, email, and a valid role are required.')
    const timestamp = now()
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id,email,name,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,updated_at=excluded.updated_at`).bind(body.userId, body.email.toLowerCase(), String(body.name || '').slice(0, 120), timestamp, timestamp),
      env.DB.prepare(`INSERT INTO memberships (workspace_id,user_id,role,created_at) VALUES (?,?,?,?) ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=excluded.role`).bind(workspaceId, body.userId, body.role, timestamp),
    ])
    await audit(env, workspaceId, access.user.id, 'membership.upserted', 'user', body.userId, { role: body.role }, requestId)
    return json({ data: { userId: body.userId, role: body.role } }, 201, request, env, requestId)
  }
  if (request.method === 'PATCH' && memberUserId) {
    const body = await jsonBody(request, 10_000)
    if (!ALLOWED_ROLES.has(body.role)) throw new ApiError(422, 'VALIDATION_ERROR', 'A valid role is required.', { field: 'role' })
    if (memberUserId === access.user.id && body.role !== 'owner') throw new ApiError(409, 'LAST_OWNER_PROTECTION', 'Owners cannot demote themselves.')
    const result = await env.DB.prepare(`UPDATE memberships SET role=? WHERE workspace_id=? AND user_id=? RETURNING user_id`).bind(body.role, workspaceId, memberUserId).first()
    if (!result) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'Member was not found.')
    await audit(env, workspaceId, access.user.id, 'membership.role.updated', 'user', memberUserId, { role: body.role }, requestId)
    return json({ data: { userId: memberUserId, role: body.role } }, 200, request, env, requestId)
  }
  if (request.method === 'DELETE' && memberUserId) {
    if (memberUserId === access.user.id) throw new ApiError(409, 'LAST_OWNER_PROTECTION', 'Owners cannot remove themselves.')
    await env.DB.prepare(`DELETE FROM memberships WHERE workspace_id=? AND user_id=?`).bind(workspaceId, memberUserId).run()
    await audit(env, workspaceId, access.user.id, 'membership.deleted', 'user', memberUserId, {}, requestId)
    return new Response(null, { status: 204, headers: responseHeaders(request, env, requestId) })
  }
  throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.')
}

async function submissions(request, env, requestId, workspaceId, eventId, submissionId) {
  const access = await identityAndMembership(request, env, workspaceId, 'organizer')
  if (request.method === 'GET' && !submissionId) {
    const result = await env.DB.prepare(`SELECT id,title,abstract,speaker_name,speaker_email,track,format,status,created_at,updated_at FROM public_submissions WHERE workspace_id=? AND event_id=? ORDER BY created_at DESC LIMIT 500`).bind(workspaceId, eventId).all()
    return json({ data: result.results || [] }, 200, request, env, requestId)
  }
  if (request.method === 'PATCH' && submissionId) {
    const body = await jsonBody(request, 10_000)
    const statuses = new Set(['needs-review', 'in-review', 'accepted', 'waitlisted', 'declined'])
    if (!statuses.has(body.status)) throw new ApiError(422, 'VALIDATION_ERROR', 'A valid submission status is required.', { field: 'status' })
    const timestamp = now()
    const result = await env.DB.prepare(`UPDATE public_submissions SET status=?,updated_at=? WHERE id=? AND workspace_id=? AND event_id=? RETURNING id`).bind(body.status, timestamp, submissionId, workspaceId, eventId).first()
    if (!result) throw new ApiError(404, 'SUBMISSION_NOT_FOUND', 'Submission was not found.')
    await audit(env, workspaceId, access.user.id, 'submission.status.updated', 'submission', submissionId, { status: body.status }, requestId)
    return json({ data: { id: submissionId, status: body.status, updatedAt: timestamp } }, 200, request, env, requestId)
  }
  throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.')
}

function safeFileName(value) {
  return value.replace(/[\r\n"\\/]/g, '_').slice(0, 180)
}

function contentMatchesType(buffer, contentType) {
  const bytes = new Uint8Array(buffer)
  const starts = (...signature) => signature.every((value, index) => bytes[index] === value)
  if (contentType === 'image/jpeg') return starts(0xff, 0xd8, 0xff)
  if (contentType === 'image/png') return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
  if (contentType === 'image/webp') return starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  if (contentType === 'application/pdf') return starts(0x25, 0x50, 0x44, 0x46, 0x2d)
  if (contentType === 'application/vnd.ms-powerpoint') return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)
  if (contentType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return starts(0x50, 0x4b, 0x03, 0x04)
  if (contentType === 'application/msword') return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)
  if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return starts(0x50, 0x4b, 0x03, 0x04)
  if (contentType === 'text/plain') {
    if (bytes.includes(0)) return false
    try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return true } catch { return false }
  }
  return false
}

async function requireEventAssetAccess(env, workspaceId, eventId, access) {
  if ((ROLE_LEVEL[access.role] || 0) >= ROLE_LEVEL.organizer) return
  const loaded = await loadedEventState(env, workspaceId, eventId)
  if (!ownSpeaker(loaded.state, access.user)) throw new ApiError(403, 'EVENT_ASSET_FORBIDDEN', 'File access requires an organizer role or a speaker profile in this event.')
  return loaded.state
}

function approvedResourceAssetIds(state) {
  return new Set((state.event?.resources || []).filter((resource) => resource?.approvalStatus === 'approved').flatMap((resource) => Array.isArray(resource.files) ? resource.files : []).filter((file) => file?.approvalStatus === 'approved' && file.assetId).map((file) => file.assetId))
}

async function assets(request, env, requestId, workspaceId, eventId, assetId) {
  const access = await identityAndMembership(request, env, workspaceId, 'speaker')
  if (!env.FILES) throw new ApiError(503, 'FILES_UNAVAILABLE', 'The R2 binding FILES is not configured.')
  const eventStateForMember = await requireEventAssetAccess(env, workspaceId, eventId, access)
  if (request.method === 'POST' && !assetId) {
    const fileName = safeFileName(requiredString(request.headers.get('x-file-name'), 'X-File-Name', 1, 180))
    const contentType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    const configuredTypes = String(env.ALLOWED_ASSET_TYPES || '').split(',').map((value) => value.trim()).filter(Boolean)
    const allowedTypes = configuredTypes.length > 0 ? new Set(configuredTypes) : ALLOWED_ASSET_TYPES
    if (!allowedTypes.has(contentType)) throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'This file type is not allowed.', { allowedTypes: [...allowedTypes] })
    const maxBytes = Math.max(1024, Number(env.MAX_ASSET_BYTES) || 10_000_000)
    const declaredSize = Number(request.headers.get('content-length') || 0)
    if (declaredSize > maxBytes) throw new ApiError(413, 'FILE_TOO_LARGE', `Files may not exceed ${maxBytes} bytes.`, { maxBytes })
    const bytes = await request.arrayBuffer()
    if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) throw new ApiError(bytes.byteLength === 0 ? 422 : 413, bytes.byteLength === 0 ? 'EMPTY_FILE' : 'FILE_TOO_LARGE', bytes.byteLength === 0 ? 'The uploaded file is empty.' : `Files may not exceed ${maxBytes} bytes.`, { maxBytes })
    if (!contentMatchesType(bytes, contentType)) throw new ApiError(415, 'FILE_SIGNATURE_MISMATCH', 'File contents do not match the declared Content-Type.', { contentType })
    const event = await env.DB.prepare(`SELECT id FROM events WHERE id=? AND workspace_id=?`).bind(eventId, workspaceId).first()
    if (!event) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event was not found.')
    const usage = await env.DB.prepare(`SELECT COALESCE(SUM(size_bytes),0) AS event_bytes,COALESCE(SUM(CASE WHEN uploaded_by=? THEN size_bytes ELSE 0 END),0) AS user_bytes,COUNT(*) AS asset_count FROM assets WHERE workspace_id=? AND event_id=?`).bind(access.user.id, workspaceId, eventId).first()
    const maxEventBytes = Math.max(maxBytes, Number(env.MAX_EVENT_ASSET_BYTES) || 250_000_000)
    const maxUserBytes = Math.max(maxBytes, Number(env.MAX_USER_EVENT_ASSET_BYTES) || 50_000_000)
    const maxAssetCount = Math.max(1, Number(env.MAX_EVENT_ASSET_COUNT) || 2_000)
    if (Number(usage?.event_bytes || 0) + bytes.byteLength > maxEventBytes || Number(usage?.asset_count || 0) >= maxAssetCount) throw new ApiError(413, 'EVENT_STORAGE_QUOTA_EXCEEDED', 'This event has reached its file storage quota.', { maxEventBytes, maxAssetCount })
    if (Number(usage?.user_bytes || 0) + bytes.byteLength > maxUserBytes) throw new ApiError(413, 'USER_STORAGE_QUOTA_EXCEEDED', 'You have reached your file storage quota for this event.', { maxUserBytes })
    const assetIdValue = id('asset')
    const objectKey = `${workspaceId}/${eventId}/${assetIdValue}-${fileName}`
    const timestamp = now()
    await env.FILES.put(objectKey, bytes, { httpMetadata: { contentType }, customMetadata: { workspaceId, eventId, assetId: assetIdValue, uploadedBy: access.user.id } })
    try {
      await env.DB.prepare(`INSERT INTO assets (id,workspace_id,event_id,object_key,file_name,content_type,size_bytes,uploaded_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(assetIdValue, workspaceId, eventId, objectKey, fileName, contentType, bytes.byteLength, access.user.id, timestamp).run()
    } catch (error) {
      await env.FILES.delete(objectKey)
      throw error
    }
    await audit(env, workspaceId, access.user.id, 'asset.uploaded', 'asset', assetIdValue, { eventId, fileName, contentType, sizeBytes: bytes.byteLength }, requestId)
    return json({ data: { id: assetIdValue, fileName, contentType, sizeBytes: bytes.byteLength, createdAt: timestamp } }, 201, request, env, requestId)
  }
  if (request.method === 'GET' && assetId) {
    const record = await env.DB.prepare(`SELECT object_key,file_name,content_type,size_bytes,uploaded_by FROM assets WHERE id=? AND workspace_id=? AND event_id=?`).bind(assetId, workspaceId, eventId).first()
    if (!record) throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset was not found.')
    if ((ROLE_LEVEL[access.role] || 0) < ROLE_LEVEL.organizer && record.uploaded_by !== access.user.id && !approvedResourceAssetIds(eventStateForMember).has(assetId)) throw new ApiError(403, 'ASSET_FORBIDDEN', 'Only organizers, the uploader, or an approved speaker resource may download this asset.')
    const object = await env.FILES.get(record.object_key)
    if (!object) throw new ApiError(404, 'ASSET_BYTES_NOT_FOUND', 'Asset metadata exists but its object is missing.')
    const headers = responseHeaders(request, env, requestId)
    headers.set('Content-Type', record.content_type)
    headers.set('Content-Length', String(record.size_bytes))
    headers.set('Content-Disposition', `attachment; filename="${safeFileName(record.file_name)}"`)
    headers.set('Cache-Control', 'private, max-age=60')
    if (object.httpEtag) headers.set('ETag', object.httpEtag)
    return new Response(object.body, { headers })
  }
  if (request.method === 'DELETE' && assetId) {
    if ((ROLE_LEVEL[access.role] || 0) < ROLE_LEVEL.organizer) throw new ApiError(403, 'ROLE_FORBIDDEN', 'Organizer access or higher is required.')
    const record = await env.DB.prepare(`SELECT object_key FROM assets WHERE id=? AND workspace_id=? AND event_id=?`).bind(assetId, workspaceId, eventId).first()
    if (!record) throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset was not found.')
    await env.FILES.delete(record.object_key)
    await env.DB.prepare(`DELETE FROM assets WHERE id=? AND workspace_id=?`).bind(assetId, workspaceId).run()
    await audit(env, workspaceId, access.user.id, 'asset.deleted', 'asset', assetId, { eventId }, requestId)
    return new Response(null, { status: 204, headers: responseHeaders(request, env, requestId) })
  }
  throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.')
}

async function loadedEventState(env, workspaceId, eventId) {
  const row = await env.DB.prepare(`SELECT e.id,e.name,e.slug,e.cfp_config,s.revision,s.state_json,s.updated_at FROM events e JOIN event_states s ON s.event_id=e.id WHERE e.id=? AND e.workspace_id=?`).bind(eventId, workspaceId).first()
  if (!row) throw new ApiError(404, 'EVENT_STATE_NEEDS_SEED', 'Event state has not been initialized.', { eventId, expectedRevision: 0, canSeed: true })
  const source = await env.DB.prepare(`SELECT id,title,abstract,speaker_name,speaker_email,track,format,status,payload_json,created_at,updated_at FROM public_submissions WHERE workspace_id=? AND event_id=? ORDER BY created_at`).bind(workspaceId, eventId).all()
  return { row, ...mergePublicSubmissionsIntoState(parseJsonColumn(row.state_json, {}), source.results || []) }
}

function idempotencyKey(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9._:-]{8,160}$/.test(value)) throw new ApiError(422, 'INVALID_IDEMPOTENCY_KEY', 'idempotencyKey must contain 8–160 URL-safe characters.', { field: 'idempotencyKey' })
  return value
}

function automationScopeKey(workspaceId, eventId) {
  return workspaceId && eventId ? `${workspaceId}:${eventId}` : 'global'
}

function storedAutomationKey(scopeKey, requestKey) {
  // The prefix also prevents collisions on databases that still retain the legacy
  // global UNIQUE(kind,idempotency_key) constraint after the additive migration.
  return `${scopeKey}:${requestKey}`
}

function publicAutomationKey(scopeKey, storedKey) {
  const prefix = `${scopeKey}:`
  return storedKey.startsWith(prefix) ? storedKey.slice(prefix.length) : storedKey
}

function automationLeaseExpiry(env, timestamp = Date.now()) {
  const configured = Number(env.AUTOMATION_LEASE_SECONDS)
  const seconds = Number.isFinite(configured) ? Math.min(3600, Math.max(60, configured)) : 900
  return new Date(timestamp + seconds * 1000).toISOString()
}

async function claimAutomationLease(env, runId, timestamp = now()) {
  const leaseToken = id('automation-lease')
  const expiresAt = automationLeaseExpiry(env, Date.parse(timestamp))
  await env.DB.prepare(`INSERT OR IGNORE INTO automation_leases (run_id,lease_token,lease_expires_at,attempt_count,updated_at) VALUES (?,?,?,1,?)`).bind(runId, leaseToken, expiresAt, timestamp).run()
  await env.DB.prepare(`UPDATE automation_leases SET lease_token=?,lease_expires_at=?,attempt_count=attempt_count+1,updated_at=? WHERE run_id=? AND lease_expires_at<?`).bind(leaseToken, expiresAt, timestamp, runId, timestamp).run()
  const lease = await env.DB.prepare(`SELECT lease_token,lease_expires_at,attempt_count FROM automation_leases WHERE run_id=?`).bind(runId).first()
  return lease?.lease_token === leaseToken ? { leaseToken, expiresAt, attemptCount: lease.attempt_count } : null
}

async function renewAutomationLease(env, runId, leaseToken) {
  const timestamp = now()
  const result = await env.DB.prepare(`UPDATE automation_leases SET lease_expires_at=?,updated_at=? WHERE run_id=? AND lease_token=?`).bind(automationLeaseExpiry(env), timestamp, runId, leaseToken).run()
  if (Number(result?.meta?.changes ?? 0) !== 1) throw new ApiError(409, 'AUTOMATION_LEASE_LOST', 'Another worker resumed this automation run.')
}

async function providerPayload(response) {
  const text = await response.text()
  if (!text) return {}
  if (new TextEncoder().encode(text).byteLength > 100_000) return { message: 'Provider response exceeded the retained 100 KB limit.' }
  try { return JSON.parse(text) } catch { return { message: text.slice(0, 2000) } }
}

async function fetchWithTimeout(url, options, env) {
  const timeoutMs = Math.min(60_000, Math.max(1_000, Number(env.PROVIDER_TIMEOUT_MS) || 15_000))
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error(`Provider timed out after ${timeoutMs} ms.`)), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Provider timed out after ${timeoutMs} ms.`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function base64Utf8(value) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(binary)
}

function calendarEscape(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function calendarDate(value) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') : ''
}

function organizerEmail(value) {
  const text = String(value || '')
  const bracketed = text.match(/<([^>]+)>/)
  const candidate = (bracketed?.[1] || text).trim()
  return validEmail(candidate) ? candidate : ''
}

export function speakerCalendarInvite(state, speaker, emailFrom, timestamp = now()) {
  const submissions = new Map((state.submissions || []).filter((submission) => submission?.status === 'accepted' && (submission.speakerIds || []).includes(speaker.id)).map((submission) => [submission.id, submission]))
  const sessions = (state.sessions || []).filter((session) => session?.published === true && submissions.has(session.submissionId) && calendarDate(session.startAt) && calendarDate(session.endAt))
  if (sessions.length === 0) return null
  const organizer = organizerEmail(emailFrom)
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OpenSpeaker//Speaker Schedule//EN', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST']
  for (const session of sessions) {
    const submission = submissions.get(session.submissionId)
    const sequence = Math.max(0, Math.floor((Date.parse(session.updatedAt) || 0) / 1000))
    lines.push('BEGIN:VEVENT', `UID:${calendarEscape(`${state.event.id}-${session.id}@openspeaker.local`)}`, `DTSTAMP:${calendarDate(timestamp)}`, `SEQUENCE:${sequence}`, 'STATUS:CONFIRMED')
    if (organizer) lines.push(`ORGANIZER:mailto:${calendarEscape(organizer)}`)
    lines.push(
      `ATTENDEE;CN=${calendarEscape(`${speaker.firstName || ''} ${speaker.lastName || ''}`.trim())};RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:${calendarEscape(speaker.email)}`,
      `DTSTART:${calendarDate(session.startAt)}`, `DTEND:${calendarDate(session.endAt)}`,
      `SUMMARY:${calendarEscape(submission.title)}`, `DESCRIPTION:${calendarEscape(submission.abstract)}`, `LOCATION:${calendarEscape(session.room)}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR', '')
  return { content: lines.join('\r\n'), eventCount: sessions.length }
}

function resendCalendarAttachment(invite, filename = 'speaker-schedule.ics') {
  return invite ? { filename, content: base64Utf8(invite.content), content_type: 'text/calendar; method=REQUEST; charset=utf-8' } : undefined
}

async function existingIntegrationRun(env, workspaceId, eventId, provider, key) {
  return env.DB.prepare(`SELECT id,status,request_json,response_json,error_code,error_message,created_at,completed_at FROM integration_runs WHERE workspace_id=? AND event_id=? AND provider=? AND idempotency_key=?`).bind(workspaceId, eventId, provider, key).first()
}

function terminalIntegrationStatus(status) {
  return ['sent', 'succeeded', 'partial', 'failed'].includes(status)
}

function leaseExpiry(env) {
  const leaseMs = Math.min(600_000, Math.max(30_000, Number(env.INTEGRATION_LEASE_MS) || 120_000))
  return new Date(Date.now() + leaseMs).toISOString()
}

async function claimIntegrationRun(env, { workspaceId, eventId, provider, action, key, userId, requestSummary }) {
  const candidateRunId = id('run')
  const leaseToken = id('lease')
  const timestamp = now()
  const expiresAt = leaseExpiry(env)
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO integration_runs (id,workspace_id,event_id,provider,action,idempotency_key,status,request_json,response_json,started_by,created_at) VALUES (?,?,?,?,? ,?,'running',?,'{}',?,?)`).bind(candidateRunId, workspaceId, eventId, provider, action, key, JSON.stringify(requestSummary), userId, timestamp),
    env.DB.prepare(`INSERT OR IGNORE INTO integration_leases (run_id,lease_token,lease_expires_at,attempt_count,updated_at) SELECT ?,?,?,1,? WHERE EXISTS (SELECT 1 FROM integration_runs WHERE id=?)`).bind(candidateRunId, leaseToken, expiresAt, timestamp, candidateRunId),
  ])
  const run = await existingIntegrationRun(env, workspaceId, eventId, provider, key)
  if (!run) throw new ApiError(500, 'INTEGRATION_RUN_MISSING', 'The durable integration run could not be created.')
  if (run.id === candidateRunId) return { mode: 'claimed', run, leaseToken, attemptCount: 1 }
  const originalSummary = parseJsonColumn(run.request_json, {})
  if (originalSummary.fingerprint && requestSummary.fingerprint && originalSummary.fingerprint !== requestSummary.fingerprint) throw new ApiError(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'This idempotency key was already used for a different payload.', { runId: run.id })
  if (terminalIntegrationStatus(run.status)) return { mode: 'replay', run }
  const insertedLease = await env.DB.prepare(`INSERT OR IGNORE INTO integration_leases (run_id,lease_token,lease_expires_at,attempt_count,updated_at) VALUES (?,?,?,1,?) RETURNING attempt_count`).bind(run.id, leaseToken, expiresAt, timestamp).first()
  if (insertedLease) return { mode: 'claimed', run, leaseToken, attemptCount: insertedLease.attempt_count }
  const claimed = await env.DB.prepare(`UPDATE integration_leases SET lease_token=?,lease_expires_at=?,attempt_count=attempt_count+1,updated_at=? WHERE run_id=? AND lease_expires_at<=? RETURNING attempt_count`).bind(leaseToken, expiresAt, timestamp, run.id, timestamp).first()
  if (claimed) return { mode: 'claimed', run, leaseToken, attemptCount: claimed.attempt_count }
  return { mode: 'in-progress', run }
}

async function renewIntegrationLease(env, runId, leaseToken) {
  const timestamp = now()
  const renewed = await env.DB.prepare(`UPDATE integration_leases SET lease_expires_at=?,updated_at=? WHERE run_id=? AND lease_token=? RETURNING run_id`).bind(leaseExpiry(env), timestamp, runId, leaseToken).first()
  if (!renewed) throw new ApiError(409, 'INTEGRATION_LEASE_LOST', 'This integration attempt was superseded by a recovery attempt.', { runId })
}

async function finishIntegrationRun(env, runId, leaseToken, status, responsePayload, errorCode, errorMessage) {
  const timestamp = now()
  const updated = await env.DB.prepare(`UPDATE integration_runs SET status=?,response_json=?,error_code=?,error_message=?,completed_at=? WHERE id=? AND EXISTS (SELECT 1 FROM integration_leases WHERE run_id=? AND lease_token=?) RETURNING id`).bind(status, JSON.stringify(responsePayload || {}), errorCode || null, errorMessage || null, timestamp, runId, runId, leaseToken).first()
  if (!updated) throw new ApiError(409, 'INTEGRATION_LEASE_LOST', 'This integration attempt was superseded before completion.', { runId })
  await env.DB.prepare(`DELETE FROM integration_leases WHERE run_id=? AND lease_token=?`).bind(runId, leaseToken).run()
}

async function integrationStatus(request, env, requestId, workspaceId, eventId) {
  await identityAndMembership(request, env, workspaceId, 'organizer')
  if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'GET' })
  const runs = await env.DB.prepare(`SELECT r.id,r.provider,r.action,r.idempotency_key,r.status,r.response_json,r.error_code,r.error_message,r.started_by,r.created_at,r.completed_at,l.lease_expires_at,l.attempt_count FROM integration_runs r LEFT JOIN integration_leases l ON l.run_id=r.id WHERE r.workspace_id=? AND r.event_id=? ORDER BY r.created_at DESC LIMIT 100`).bind(workspaceId, eventId).all()
  const deliveries = await env.DB.prepare(`SELECT id,run_id,idempotency_key,recipient_speaker_id,recipient_email,subject,provider_message_id,status,error_message,created_at,updated_at FROM message_deliveries WHERE workspace_id=? AND event_id=? ORDER BY created_at DESC LIMIT 250`).bind(workspaceId, eventId).all()
  const mappings = await env.DB.prepare(`SELECT object_type,local_id,remote_id,updated_at FROM integration_object_mappings WHERE workspace_id=? AND event_id=? AND provider='accelevents' ORDER BY object_type,local_id LIMIT 1000`).bind(workspaceId, eventId).all()
  return json({ data: { configured: { resend: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM), accelevents: Boolean(env.ACCELEVENTS_API_KEY && env.ACCELEVENTS_EVENT_URL) }, runs: (runs.results || []).map((run) => ({ ...run, response: parseJsonColumn(run.response_json, {}), response_json: undefined })), deliveries: deliveries.results || [], mappings: mappings.results || [] } }, 200, request, env, requestId)
}

async function sendEmailIntegration(request, env, requestId, workspaceId, eventId) {
  const access = await identityAndMembership(request, env, workspaceId, 'organizer')
  if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'POST' })
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new ApiError(503, 'PROVIDER_NOT_CONFIGURED', 'Configure RESEND_API_KEY and EMAIL_FROM to send email.', { provider: 'resend' })
  const body = await jsonBody(request, 1_500_000)
  const key = idempotencyKey(body.idempotencyKey)
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 100) throw new ApiError(422, 'VALIDATION_ERROR', 'messages must contain 1–100 personalized messages.', { field: 'messages' })
  const loaded = await loadedEventState(env, workspaceId, eventId)
  const speakers = new Map((loaded.state.speakers || []).map((speaker) => [speaker.id, speaker]))
  const messages = body.messages.map((message, index) => {
    const speaker = speakers.get(message?.speakerId)
    if (!speaker || !validEmail(speaker.email)) throw new ApiError(422, 'UNKNOWN_RECIPIENT', 'Every message must reference a speaker in this event with a valid email.', { field: `messages.${index}.speakerId` })
    const subject = requiredString(message.subject, `messages.${index}.subject`, 1, 300)
    const text = typeof message.text === 'string' ? message.text : ''
    const html = typeof message.html === 'string' ? message.html : ''
    if ((!text && !html) || text.length > 100_000 || html.length > 200_000) throw new ApiError(422, 'VALIDATION_ERROR', 'Each message requires text or HTML within size limits.', { field: `messages.${index}` })
    let attachment
    if (message.attachment !== undefined) {
      if (!message.attachment || typeof message.attachment !== 'object' || message.attachment.type !== 'text/calendar' || typeof message.attachment.filename !== 'string' || !/^[a-zA-Z0-9._ -]{1,120}\.ics$/i.test(message.attachment.filename)) throw new ApiError(422, 'INVALID_CALENDAR_ATTACHMENT', 'attachment must request a text/calendar .ics file.', { field: `messages.${index}.attachment` })
      attachment = resendCalendarAttachment(speakerCalendarInvite(loaded.state, speaker, env.EMAIL_FROM), message.attachment.filename)
      if (!attachment) throw new ApiError(422, 'CALENDAR_EMPTY', 'This speaker has no published accepted sessions to include.', { field: `messages.${index}.speakerId` })
    }
    return { speaker, subject, text, html, attachment }
  })
  const timestamp = now()
  const claim = await claimIntegrationRun(env, { workspaceId, eventId, provider: 'resend', action: 'email.send', key, userId: access.user.id, requestSummary: { fingerprint: await durableKey(JSON.stringify({ replyTo: body.replyTo || null, messages: body.messages })), messageCount: messages.length, speakerIds: messages.map((item) => item.speaker.id) } })
  if (claim.mode === 'replay') return json({ data: { runId: claim.run.id, status: claim.run.status, replayed: true, result: parseJsonColumn(claim.run.response_json, {}), errorCode: claim.run.error_code, errorMessage: claim.run.error_message } }, 200, request, env, requestId)
  if (claim.mode === 'in-progress') throw new ApiError(409, 'INTEGRATION_IN_PROGRESS', 'A request with this idempotency key is already running.', { runId: claim.run.id }, { 'Retry-After': '5' })
  const runId = claim.run.id
  const results = []
  for (const [index, message] of messages.entries()) {
    await renewIntegrationLease(env, runId, claim.leaseToken)
    const candidateDeliveryId = id('delivery')
    const deliveryKey = `${key}:${index}`
    await env.DB.prepare(`INSERT OR IGNORE INTO message_deliveries (id,run_id,workspace_id,event_id,idempotency_key,recipient_speaker_id,recipient_email,subject,status,requested_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?, 'queued',?,?,?)`).bind(candidateDeliveryId, runId, workspaceId, eventId, deliveryKey, message.speaker.id, message.speaker.email.toLowerCase(), message.subject, access.user.id, timestamp, timestamp).run()
    const delivery = await env.DB.prepare(`SELECT id,status,provider_message_id,error_message FROM message_deliveries WHERE workspace_id=? AND event_id=? AND idempotency_key=? AND recipient_email=?`).bind(workspaceId, eventId, deliveryKey, message.speaker.email.toLowerCase()).first()
    if (!delivery) throw new ApiError(500, 'DELIVERY_RECORD_MISSING', 'The durable delivery record could not be loaded.')
    const deliveryId = delivery.id
    if (delivery.status === 'sent' || delivery.status === 'failed') {
      results.push({ speakerId: message.speaker.id, deliveryId, status: delivery.status, providerMessageId: delivery.provider_message_id, error: delivery.error_message })
      continue
    }
    try {
      const response = await fetchWithTimeout('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': deliveryKey }, body: JSON.stringify({ from: env.EMAIL_FROM, to: [message.speaker.email], subject: message.subject, text: message.text || undefined, html: message.html || undefined, reply_to: body.replyTo || undefined, attachments: message.attachment ? [message.attachment] : undefined }) }, env)
      const provider = await providerPayload(response)
      if (!response.ok) throw new Error(provider.message || `Resend returned HTTP ${response.status}`)
      await env.DB.prepare(`UPDATE message_deliveries SET status='sent',provider_message_id=?,error_message=NULL,updated_at=? WHERE id=? AND EXISTS (SELECT 1 FROM integration_leases WHERE run_id=? AND lease_token=?)`).bind(provider.id || null, now(), deliveryId, runId, claim.leaseToken).run()
      results.push({ speakerId: message.speaker.id, deliveryId, status: 'sent', providerMessageId: provider.id })
    } catch (error) {
      const messageText = error instanceof Error ? error.message.slice(0, 1000) : 'Email delivery failed.'
      await env.DB.prepare(`UPDATE message_deliveries SET status='failed',error_message=?,updated_at=? WHERE id=? AND EXISTS (SELECT 1 FROM integration_leases WHERE run_id=? AND lease_token=?)`).bind(messageText, now(), deliveryId, runId, claim.leaseToken).run()
      results.push({ speakerId: message.speaker.id, deliveryId, status: 'failed', error: messageText })
    }
  }
  const sent = results.filter((result) => result.status === 'sent').length
  const status = sent === results.length ? 'sent' : sent === 0 ? 'failed' : 'partial'
  const resultPayload = { sent, failed: results.length - sent, deliveries: results }
  await finishIntegrationRun(env, runId, claim.leaseToken, status, resultPayload, status === 'sent' ? null : 'DELIVERY_FAILED', status === 'sent' ? null : 'One or more messages failed.')
  await audit(env, workspaceId, access.user.id, 'integration.email.completed', 'event', eventId, { runId, status, sent, failed: results.length - sent }, requestId)
  return json({ data: { runId, status, replayed: false, result: resultPayload } }, status === 'failed' ? 502 : status === 'partial' ? 207 : 200, request, env, requestId)
}

export function acceleventsReadModel(state, eventId) {
  const mapping = state.event?.accelevents || {}
  const accepted = (state.submissions || []).filter((submission) => submission.status === 'accepted')
  const acceptedIds = new Set(accepted.map((submission) => submission.id))
  const submissionById = new Map(accepted.map((submission) => [submission.id, submission]))
  const sessions = (state.sessions || []).filter((session) => acceptedIds.has(session.submissionId) && (mapping.includeOnlyPublishedSessions === false || session.published)).map((session) => {
    const submission = submissionById.get(session.submissionId)
    return {
      id: session.id,
      title: submission?.[mapping.sessionTitle || 'title'] || submission?.title || '',
      description: submission?.[mapping.description || 'abstract'] || submission?.abstract || '',
      track: submission?.[mapping.track || 'track'] || submission?.track || '',
      format: submission?.[mapping.type || 'format'] || submission?.format || '',
      location: session?.[mapping.location || 'room'] || session.room,
      startTime: session.startAt,
      endTime: session.endAt,
      published: session.published === true,
      speakerIds: submission?.speakerIds || [],
    }
  })
  const speakerIds = new Set(sessions.flatMap((session) => session.speakerIds))
  const speakers = (state.speakers || []).filter((speaker) => speakerIds.has(speaker.id) && (mapping.includeOnlyConfirmedSpeakers === false || speaker.status === 'confirmed')).map(({ id: speakerId, firstName, lastName, email, company, jobTitle, bio, pronouns, photoUrl }) => ({ id: speakerId, firstName, lastName, email, company, title: jobTitle, bio, pronouns, imageUrl: photoUrl }))
  const retainedSpeakerIds = new Set(speakers.map((speaker) => speaker.id))
  return { eventId, event: { id: state.event?.id, name: state.event?.name, timezone: state.event?.timezone }, mapping, sessions: sessions.map((session) => ({ ...session, speakerIds: session.speakerIds.filter((speakerId) => retainedSpeakerIds.has(speakerId)) })), speakers }
}

function acceleventsSessionFormat(value, location) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'workshop') return 'WORKSHOP'
  if (normalized === 'meetup' || normalized === 'meet up') return 'MEET_UP'
  if (normalized === 'expo') return 'EXPO'
  if (normalized === 'break') return 'BREAK'
  if (String(location || '').toLowerCase().includes('main')) return 'MAIN_STAGE'
  return 'BREAKOUT_SESSION'
}

function acceleventsDateTime(value, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
  const part = (type) => parts.find((entry) => entry.type === type)?.value || ''
  return `${part('year')}/${part('month')}/${part('day')} ${part('hour')}:${part('minute')}`
}

function remoteObjectId(payload, type) {
  if (typeof payload === 'number' || typeof payload === 'string') return String(payload)
  if (!isRecord(payload)) return ''
  const candidate = payload.id ?? payload[`${type}Id`] ?? payload.data?.id ?? payload.data?.[`${type}Id`]
  return typeof candidate === 'number' || typeof candidate === 'string' ? String(candidate) : ''
}

async function syncAcceleventsObject(env, workspaceId, eventId, type, localId, body, baseUrl, eventUrl) {
  const mapping = await env.DB.prepare(`SELECT remote_id FROM integration_object_mappings WHERE workspace_id=? AND event_id=? AND provider='accelevents' AND object_type=? AND local_id=?`).bind(workspaceId, eventId, type, localId).first()
  const collection = `${baseUrl}/rest/host/event/${encodeURIComponent(eventUrl)}/${type}`
  const url = mapping ? `${collection}/${encodeURIComponent(mapping.remote_id)}` : collection
  const response = await fetchWithTimeout(url, { method: mapping ? 'PUT' : 'POST', headers: { Key: env.ACCELEVENTS_API_KEY, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, env)
  const payload = await providerPayload(response)
  if (!response.ok) throw new Error(`Accelevents ${type} ${localId} returned HTTP ${response.status}: ${payload.message || 'provider error'}`)
  const remoteId = mapping?.remote_id || remoteObjectId(payload, type)
  if (!remoteId) throw new Error(`Accelevents did not return a remote ${type} id for ${localId}.`)
  await env.DB.prepare(`INSERT INTO integration_object_mappings (workspace_id,event_id,provider,object_type,local_id,remote_id,updated_at) VALUES (?,?,'accelevents',?,?,?,?) ON CONFLICT(workspace_id,event_id,provider,object_type,local_id) DO UPDATE SET remote_id=excluded.remote_id,updated_at=excluded.updated_at`).bind(workspaceId, eventId, type, localId, remoteId, now()).run()
  return { localId, remoteId, operation: mapping ? 'updated' : 'created' }
}

async function syncAccelevents(request, env, requestId, workspaceId, eventId) {
  const access = await identityAndMembership(request, env, workspaceId, 'organizer')
  if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'POST' })
  if (!env.ACCELEVENTS_API_KEY || !env.ACCELEVENTS_EVENT_URL) throw new ApiError(503, 'PROVIDER_NOT_CONFIGURED', 'Configure ACCELEVENTS_API_KEY and ACCELEVENTS_EVENT_URL to sync.', { provider: 'accelevents' })
  if (!/^[a-zA-Z0-9_-]{2,160}$/.test(env.ACCELEVENTS_EVENT_URL)) throw new ApiError(503, 'PROVIDER_CONFIG_INVALID', 'ACCELEVENTS_EVENT_URL must be the event URL slug, not a full URL.')
  const baseUrl = String(env.ACCELEVENTS_API_BASE_URL || 'https://api.accelevents.com').replace(/\/$/, '')
  if (!/^https:\/\//i.test(baseUrl)) throw new ApiError(503, 'PROVIDER_CONFIG_INVALID', 'ACCELEVENTS_API_BASE_URL must use HTTPS.')
  const body = await jsonBody(request, 20_000)
  const key = idempotencyKey(body.idempotencyKey)
  const loaded = await loadedEventState(env, workspaceId, eventId)
  const payload = acceleventsReadModel(loaded.state, eventId)
  const claim = await claimIntegrationRun(env, { workspaceId, eventId, provider: 'accelevents', action: 'program.sync', key, userId: access.user.id, requestSummary: { fingerprint: await durableKey(JSON.stringify(payload)), sessionCount: payload.sessions.length, speakerCount: payload.speakers.length } })
  if (claim.mode === 'replay') return json({ data: { runId: claim.run.id, status: claim.run.status, replayed: true, result: parseJsonColumn(claim.run.response_json, {}) } }, 200, request, env, requestId)
  if (claim.mode === 'in-progress') throw new ApiError(409, 'INTEGRATION_IN_PROGRESS', 'A request with this idempotency key is already running.', { runId: claim.run.id }, { 'Retry-After': '5' })
  const runId = claim.run.id
  let responsePayload = {}
  let terminal = false
  try {
    const speakerResults = []
    const remoteSpeakerIds = new Map()
    for (const speaker of payload.speakers) {
      await renewIntegrationLease(env, runId, claim.leaseToken)
      const result = await syncAcceleventsObject(env, workspaceId, eventId, 'speaker', speaker.id, { firstName: speaker.firstName, lastName: speaker.lastName, email: speaker.email, company: speaker.company, title: speaker.title, bio: speaker.bio, pronouns: speaker.pronouns, imageUrl: speaker.imageUrl }, baseUrl, env.ACCELEVENTS_EVENT_URL)
      remoteSpeakerIds.set(speaker.id, result.remoteId)
      speakerResults.push(result)
    }
    const sessionResults = []
    for (const session of payload.sessions) {
      await renewIntegrationLease(env, runId, claim.leaseToken)
      const result = await syncAcceleventsObject(env, workspaceId, eventId, 'session', session.id, { title: session.title, description: session.description, startTime: acceleventsDateTime(session.startTime, payload.event.timezone), endTime: acceleventsDateTime(session.endTime, payload.event.timezone), location: session.location, status: session.published ? 'VISIBLE' : 'HIDDEN', format: acceleventsSessionFormat(session.format, session.location), sessionVisibilityType: 'PUBLIC', speakerIds: session.speakerIds.map((speakerId) => remoteSpeakerIds.get(speakerId)).filter(Boolean) }, baseUrl, env.ACCELEVENTS_EVENT_URL)
      sessionResults.push(result)
    }
    responsePayload = { speakers: speakerResults, sessions: sessionResults }
    await finishIntegrationRun(env, runId, claim.leaseToken, 'succeeded', responsePayload)
    terminal = true
    await audit(env, workspaceId, access.user.id, 'integration.accelevents.succeeded', 'event', eventId, { runId, sessionCount: payload.sessions.length }, requestId)
    return json({ data: { runId, status: 'succeeded', replayed: false, result: responsePayload, synced: { sessions: payload.sessions.length, speakers: payload.speakers.length } } }, 200, request, env, requestId)
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : 'Accelevents sync failed.'
    if (!terminal && !(error instanceof ApiError && error.code === 'INTEGRATION_LEASE_LOST')) await finishIntegrationRun(env, runId, claim.leaseToken, 'failed', responsePayload, 'PROVIDER_ERROR', message)
    await audit(env, workspaceId, access.user.id, 'integration.accelevents.failed', 'event', eventId, { runId, message }, requestId)
    throw new ApiError(502, 'PROVIDER_ERROR', 'Accelevents sync failed.', { runId, providerMessage: message })
  }
}

function ownSpeaker(state, user) {
  return (state.speakers || []).find((speaker) => typeof speaker.email === 'string' && speaker.email.trim().toLowerCase() === user.email)
}

function projectSpeakerPortal(state, speaker, assetsForUser, workspaceId, eventId) {
  const submissions = (state.submissions || []).filter((submission) => (submission.speakerIds || []).includes(speaker.id))
  const submissionIds = new Set(submissions.map((submission) => submission.id))
  const resources = (Array.isArray(state.event?.resources) ? state.event.resources : []).filter((resource) => resource?.approvalStatus === 'approved' && (!Array.isArray(resource?.speakerIds) || resource.speakerIds.includes(speaker.id))).map(({ id: resourceId, title, body, embedUrl, version, approvalStatus, updatedAt, files }) => ({
    id: resourceId,
    title,
    body,
    embedUrl: typeof embedUrl === 'string' && /^https:\/\//i.test(embedUrl) ? embedUrl : undefined,
    version,
    approvalStatus,
    updatedAt,
    files: (Array.isArray(files) ? files : []).filter((file) => file?.approvalStatus === 'approved').map(({ id: fileId, name, assetId, url, contentType, size, version: fileVersion, approvalStatus: fileApprovalStatus, uploadedAt, approvedAt }) => ({
      id: fileId,
      name,
      assetId,
      url: assetId ? `/api/workspaces/${encodeURIComponent(workspaceId)}/events/${encodeURIComponent(eventId)}/assets/${encodeURIComponent(assetId)}` : typeof url === 'string' && /^https:\/\//i.test(url) ? url : undefined,
      contentType,
      size,
      version: fileVersion,
      approvalStatus: fileApprovalStatus,
      uploadedAt,
      approvedAt,
    })),
  }))
  return {
    event: state.event,
    speaker,
    submissions,
    tasks: (state.tasks || []).filter((task) => task.speakerId === speaker.id),
    sessions: (state.sessions || []).filter((session) => submissionIds.has(session.submissionId)),
    resources,
    assets: assetsForUser,
  }
}

async function speakerPortal(request, env, requestId, workspaceId, eventId) {
  const user = await authenticatedUser(request, env)
  const loaded = await loadedEventState(env, workspaceId, eventId)
  const speaker = ownSpeaker(loaded.state, user)
  if (!speaker) throw new ApiError(404, 'SPEAKER_PROFILE_NOT_LINKED', 'No speaker profile in this event matches your authenticated email.')
  await env.DB.prepare(`INSERT OR IGNORE INTO memberships (workspace_id,user_id,role,created_at) SELECT ?,?,'speaker',? WHERE EXISTS (SELECT 1 FROM workspaces WHERE id=?)`).bind(workspaceId, user.id, now(), workspaceId).run()
  const access = { user }
  const assetRows = await env.DB.prepare(`SELECT id,file_name,content_type,size_bytes,created_at FROM assets WHERE workspace_id=? AND event_id=? AND uploaded_by=? ORDER BY created_at DESC`).bind(workspaceId, eventId, access.user.id).all()
  const assetProjection = (assetRows.results || []).map((asset) => ({ ...asset, downloadUrl: `/api/workspaces/${encodeURIComponent(workspaceId)}/events/${encodeURIComponent(eventId)}/assets/${encodeURIComponent(asset.id)}` }))
  if (request.method === 'GET') return json({ data: { revision: loaded.row.revision, portal: projectSpeakerPortal(loaded.state, speaker, assetProjection, workspaceId, eventId) } }, 200, request, env, requestId, { ETag: `"${loaded.row.revision}"` })
  if (request.method !== 'PATCH') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'GET, PATCH' })
  const body = await jsonBody(request, 200_000)
  if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision !== loaded.row.revision) throw new ApiError(409, 'REVISION_CONFLICT', 'Speaker data has changed since it was loaded.', { expectedRevision: body.expectedRevision, currentRevision: loaded.row.revision })
  const profile = body.profile && typeof body.profile === 'object' && !Array.isArray(body.profile) ? body.profile : {}
  const allowedText = { firstName: 80, lastName: 80, company: 160, jobTitle: 160, bio: 5000, pronouns: 80, photoUrl: 2000, twitterUrl: 2000, linkedinUrl: 2000, travelPreferences: 5000 }
  const profilePatch = {}
  for (const [field, max] of Object.entries(allowedText)) {
    if (profile[field] !== undefined) {
      if (typeof profile[field] !== 'string' || profile[field].length > max) throw new ApiError(422, 'VALIDATION_ERROR', `${field} is invalid.`, { field: `profile.${field}` })
      profilePatch[field] = profile[field].trim()
    }
  }
  if (profilePatch.photoUrl && !/^https:\/\//i.test(profilePatch.photoUrl)) throw new ApiError(422, 'VALIDATION_ERROR', 'photoUrl must use HTTPS.', { field: 'profile.photoUrl' })
  for (const field of ['twitterUrl', 'linkedinUrl']) if (profilePatch[field] && !/^https:\/\//i.test(profilePatch[field])) throw new ApiError(422, 'VALIDATION_ERROR', `${field} must use HTTPS.`, { field: `profile.${field}` })
  if (profile.status !== undefined) {
    if (!new Set(['invited', 'confirmed', 'declined']).has(profile.status)) throw new ApiError(422, 'VALIDATION_ERROR', 'status must be invited, confirmed, or declined.', { field: 'profile.status' })
    profilePatch.status = profile.status
  }
  if (profile.availability !== undefined) {
    if (!Array.isArray(profile.availability) || profile.availability.length > 20 || !profile.availability.every((window) => window && Number.isFinite(Date.parse(window.startAt)) && Number.isFinite(Date.parse(window.endAt)) && Date.parse(window.startAt) < Date.parse(window.endAt))) throw new ApiError(422, 'VALIDATION_ERROR', 'availability must contain valid start/end windows.', { field: 'profile.availability' })
    profilePatch.availability = profile.availability.map((window) => ({ startAt: new Date(window.startAt).toISOString(), endAt: new Date(window.endAt).toISOString() }))
  }
  const taskUpdates = body.taskUpdates === undefined ? [] : body.taskUpdates
  if (!Array.isArray(taskUpdates) || taskUpdates.length > 25) throw new ApiError(422, 'VALIDATION_ERROR', 'taskUpdates must be an array of up to 25 updates.', { field: 'taskUpdates' })
  const taskMap = new Map((loaded.state.tasks || []).filter((task) => task.speakerId === speaker.id).map((task) => [task.id, task]))
  for (const update of taskUpdates) {
    const task = taskMap.get(update?.id)
    if (!task) throw new ApiError(403, 'TASK_FORBIDDEN', 'A task does not belong to your speaker profile.')
    let asset
    if (update.assetId) {
      const assetRow = await env.DB.prepare(`SELECT id,file_name,content_type,size_bytes,created_at FROM assets WHERE id=? AND workspace_id=? AND event_id=? AND uploaded_by=?`).bind(update.assetId, workspaceId, eventId, access.user.id).first()
      if (!assetRow) throw new ApiError(403, 'ASSET_FORBIDDEN', 'The selected asset does not belong to you in this event.')
      asset = { id: assetRow.id, name: assetRow.file_name, type: assetRow.content_type, size: assetRow.size_bytes, selectedAt: assetRow.created_at, storage: 'r2' }
    }
    let deliverableVersions = Array.isArray(task.deliverableVersions) ? [...task.deliverableVersions] : []
    let assetVersion = task.assetVersion
    if (asset && asset.id !== task.asset?.id) {
      if (task.asset?.id && !deliverableVersions.some((version) => version.asset?.id === task.asset.id)) deliverableVersions.push({ id: `deliverable-version-${task.asset.id}`, asset: task.asset, version: Number(task.assetVersion) || 1, uploadedAt: task.asset.selectedAt || task.updatedAt, uploadedBy: 'Previous speaker upload' })
      const nextVersion = Math.max(Number(task.assetVersion) || 0, ...deliverableVersions.map((version) => Number(version.version) || 0)) + 1
      deliverableVersions.push({ id: `deliverable-version-${asset.id}`, asset, version: nextVersion, uploadedAt: asset.selectedAt, uploadedBy: `${speaker.firstName || ''} ${speaker.lastName || ''}`.trim() || speaker.email })
      assetVersion = nextVersion
    }
    let comments = Array.isArray(task.comments) ? [...task.comments] : []
    if (update.newComment !== undefined) {
      const comment = update.newComment
      if (!isRecord(comment) || !validId(comment.id) || typeof comment.body !== 'string' || !comment.body.trim() || comment.body.length > 5_000 || !validIsoDate(comment.createdAt)) throw new ApiError(422, 'VALIDATION_ERROR', 'newComment requires a valid id, body, and ISO createdAt.', { field: 'taskUpdates.newComment' })
      const duplicate = comments.find((item) => item.id === comment.id)
      if (duplicate && duplicate.body !== comment.body.trim()) throw new ApiError(409, 'COMMENT_ID_CONFLICT', 'A different comment already uses this id.', { commentId: comment.id })
      if (!duplicate) {
        if (comments.length >= 500) throw new ApiError(422, 'VALIDATION_ERROR', 'A task may contain at most 500 comments.', { field: 'taskUpdates.newComment' })
        comments.push({ id: comment.id, authorName: `${speaker.firstName || ''} ${speaker.lastName || ''}`.trim() || speaker.email, authorRole: 'speaker', body: comment.body.trim(), createdAt: comment.createdAt })
      }
    }
    taskMap.set(task.id, { ...task, completedAt: update.completed === true ? now() : update.completed === false ? undefined : task.completedAt, asset: asset || task.asset, assetVersion, deliverableVersions, comments, approvalStatus: asset && asset.id !== task.asset?.id ? 'pending' : task.approvalStatus, updatedAt: now() })
  }
  const timestamp = now()
  const nextState = {
    ...loaded.state,
    lastUpdatedAt: timestamp,
    speakers: loaded.state.speakers.map((item) => item.id === speaker.id ? { ...item, ...profilePatch, updatedAt: timestamp } : item),
    tasks: (loaded.state.tasks || []).map((task) => taskMap.get(task.id) || task),
  }
  validateAppStateDocument(nextState, eventId)
  const updated = await persistStateRevision(env, { workspaceId, eventId, state: nextState, expectedRevision: body.expectedRevision, userId: access.user.id, timestamp, reason: 'speaker portal update' })
  if (!updated) throw new ApiError(409, 'REVISION_CONFLICT', 'Speaker data has changed since it was loaded.', { expectedRevision: body.expectedRevision })
  await audit(env, workspaceId, access.user.id, 'speaker.portal.updated', 'speaker', speaker.id, { taskIds: taskUpdates.map((update) => update.id), profileFields: Object.keys(profilePatch), revision: updated.revision }, requestId)
  const updatedSpeaker = nextState.speakers.find((item) => item.id === speaker.id)
  return json({ data: { revision: updated.revision, portal: projectSpeakerPortal(nextState, updatedSpeaker, assetProjection, workspaceId, eventId) } }, 200, request, env, requestId, { ETag: `"${updated.revision}"` })
}

function speakerProposalFields(body, existing, state, submit) {
  const text = (field, max, fallback = '') => {
    const value = body[field] === undefined ? fallback : body[field]
    if (typeof value !== 'string' || value.length > max) throw new ApiError(422, 'VALIDATION_ERROR', `${field} is invalid.`, { field })
    return value.trim()
  }
  const title = text('title', 200, existing?.title)
  const abstract = text('abstract', 20_000, existing?.abstract)
  const track = text('track', 120, existing?.track)
  const format = text('format', 120, existing?.format || 'Talk')
  if (submit && (title.length < 3 || abstract.length < 20 || !track || !format)) throw new ApiError(422, 'VALIDATION_ERROR', 'Submitted proposals require title, abstract, track, and format.', { fields: ['title', 'abstract', 'track', 'format'] })
  if (track && Array.isArray(state.event?.tracks) && state.event.tracks.length && !state.event.tracks.includes(track)) throw new ApiError(422, 'VALIDATION_ERROR', 'track is not configured for this event.', { field: 'track' })
  const durationMinutes = body.durationMinutes === undefined ? Number(existing?.durationMinutes || 30) : Number(body.durationMinutes)
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) throw new ApiError(422, 'VALIDATION_ERROR', 'durationMinutes must be between 5 and 480.', { field: 'durationMinutes' })
  const tags = body.tags === undefined ? (existing?.tags || []) : body.tags
  if (!Array.isArray(tags) || tags.length > 20 || !tags.every((tag) => typeof tag === 'string' && tag.length <= 80)) throw new ApiError(422, 'VALIDATION_ERROR', 'tags must be an array of up to 20 short strings.', { field: 'tags' })
  return { title, abstract, track, format, durationMinutes, tags: tags.map((tag) => tag.trim()).filter(Boolean), customAnswers: isRecord(body.customAnswers) ? body.customAnswers : existing?.customAnswers || {} }
}

async function speakerProposalMutation(request, env, requestId, workspaceId, eventId, submissionId) {
  const user = await authenticatedUser(request, env)
  const loaded = await loadedEventState(env, workspaceId, eventId)
  const speaker = ownSpeaker(loaded.state, user)
  if (!speaker) throw new ApiError(404, 'SPEAKER_PROFILE_NOT_LINKED', 'No speaker profile in this event matches your authenticated email.')
  await env.DB.prepare(`INSERT OR IGNORE INTO memberships (workspace_id,user_id,role,created_at) SELECT ?,?,'speaker',? WHERE EXISTS (SELECT 1 FROM workspaces WHERE id=?)`).bind(workspaceId, user.id, now(), workspaceId).run()
  if (!['POST', 'PATCH'].includes(request.method)) throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'POST, PATCH' })
  const body = await jsonBody(request, 100_000)
  if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision !== loaded.row.revision) throw new ApiError(409, 'REVISION_CONFLICT', 'Proposal data has changed since it was loaded.', { expectedRevision: body.expectedRevision, currentRevision: loaded.row.revision })
  const cfp = loaded.state.event?.cfp || {}
  if (cfp.open === false || (cfp.closeAt && Number.isFinite(Date.parse(cfp.closeAt)) && Date.now() >= Date.parse(cfp.closeAt))) throw new ApiError(410, 'CFP_CLOSED', 'Proposal editing is locked because the call for proposals has closed.', { closeAt: cfp.closeAt })
  const existing = submissionId ? (loaded.state.submissions || []).find((submission) => submission.id === submissionId) : undefined
  if (submissionId && (!existing || !Array.isArray(existing.speakerIds) || !existing.speakerIds.includes(speaker.id))) throw new ApiError(403, 'SUBMISSION_FORBIDDEN', 'You may only edit your own proposals.')
  if (existing && ['accepted', 'waitlisted', 'declined'].includes(existing.status)) throw new ApiError(409, 'SUBMISSION_LOCKED', 'A decided proposal can no longer be edited.')
  const submit = body.action === 'submit'
  const fields = speakerProposalFields(body, existing, loaded.state, submit)
  const timestamp = now()
  const proposal = {
    ...(existing || {}),
    id: existing?.id || id('proposal'),
    ...fields,
    speakerIds: existing?.speakerIds || [speaker.id],
    status: existing?.status || 'needs-review',
    lifecycle: submit ? 'submitted' : body.action === 'save-draft' ? 'draft' : existing?.lifecycle || 'draft',
    origin: existing?.origin || 'cfp',
    cfpVersion: existing?.cfpVersion || Number(cfp.version) || 1,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  }
  const nextState = { ...loaded.state, lastUpdatedAt: timestamp, submissions: existing ? loaded.state.submissions.map((item) => item.id === existing.id ? proposal : item) : [...loaded.state.submissions, proposal] }
  validateAppStateDocument(nextState, eventId)
  const updated = await persistStateRevision(env, { workspaceId, eventId, state: nextState, expectedRevision: body.expectedRevision, userId: user.id, timestamp, reason: submit ? 'speaker proposal submitted' : 'speaker proposal draft saved' })
  if (!updated) throw new ApiError(409, 'REVISION_CONFLICT', 'Proposal data has changed since it was loaded.', { expectedRevision: body.expectedRevision })
  await audit(env, workspaceId, user.id, submit ? 'speaker.proposal.submitted' : 'speaker.proposal.saved', 'submission', proposal.id, { eventId, lifecycle: proposal.lifecycle, revision: updated.revision }, requestId)
  return json({ data: { revision: updated.revision, proposal } }, existing ? 200 : 201, request, env, requestId, { ETag: `"${updated.revision}"` })
}

function assignmentReviewerEmail(assignment) {
  return String(assignment?.reviewerEmail || assignment?.assignedToEmail || assignment?.email || assignment?.reviewer?.email || '').trim().toLowerCase()
}

async function reviewerMutation(request, env, requestId, workspaceId, eventId) {
  const access = await identityAndMembership(request, env, workspaceId, 'reviewer')
  if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'POST' })
  const body = await jsonBody(request, 100_000)
  const loaded = await loadedEventState(env, workspaceId, eventId)
  if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision !== loaded.row.revision) throw new ApiError(409, 'REVISION_CONFLICT', 'Review data has changed since it was loaded.', { expectedRevision: body.expectedRevision, currentRevision: loaded.row.revision })
  const assignments = Array.isArray(loaded.state.evaluationAssignments) ? loaded.state.evaluationAssignments : []
  const assignment = assignments.find((item) => item.id === body.assignmentId && item.submissionId === body.submissionId)
  if (!assignment || assignmentReviewerEmail(assignment) !== access.user.email) throw new ApiError(403, 'REVIEW_ASSIGNMENT_FORBIDDEN', 'You may only review submissions assigned to your authenticated email.')
  const round = (Array.isArray(loaded.state.evaluationRounds) ? loaded.state.evaluationRounds : []).find((item) => item.id === assignment.roundId)
  const currentTime = Date.now()
  if (!round || round.status !== 'open' || (round.opensAt && Date.parse(round.opensAt) > currentTime) || !round.dueAt || Date.parse(round.dueAt) < currentTime) throw new ApiError(409, 'REVIEW_ROUND_CLOSED', 'This evaluation round is not currently open for reviews.')
  const rubric = Array.isArray(round.rubric) ? round.rubric : []
  const ratingCriteria = rubric.filter((criterion) => (criterion.type || 'rating') === 'rating')
  const scores = body.review?.scores
  if (!scores || typeof scores !== 'object' || Array.isArray(scores) || Object.keys(scores).length > 100 || !Object.values(scores).every((score) => typeof score === 'number' && Number.isFinite(score))) throw new ApiError(422, 'VALIDATION_ERROR', 'review.scores must be a numeric score map.', { field: 'review.scores' })
  if (Object.keys(scores).some((criterionId) => !ratingCriteria.some((criterion) => criterion.id === criterionId)) || ratingCriteria.some((criterion) => criterion.required !== false && (typeof scores[criterion.id] !== 'number' || scores[criterion.id] < 1 || scores[criterion.id] > criterion.maxScore))) throw new ApiError(422, 'VALIDATION_ERROR', 'review.scores must match required numeric rubric criteria and ranges.', { field: 'review.scores' })
  const answers = isRecord(body.review?.answers) ? body.review.answers : { ...scores }
  if (Object.keys(answers).length > 100) throw new ApiError(422, 'VALIDATION_ERROR', 'review.answers contains too many values.', { field: 'review.answers' })
  for (const criterion of rubric) {
    const type = criterion.type || 'rating'
    const answer = type === 'rating' ? scores[criterion.id] : answers[criterion.id]
    if (criterion.required !== false && (answer === undefined || answer === null || String(answer).trim() === '')) throw new ApiError(422, 'VALIDATION_ERROR', `${criterion.label || 'A rubric answer'} is required.`, { field: `review.answers.${criterion.id}` })
    if (answer === undefined || answer === null || answer === '') continue
    if (type === 'select' && (!Array.isArray(criterion.options) || !criterion.options.includes(answer))) throw new ApiError(422, 'VALIDATION_ERROR', 'A dropdown answer is not one of the configured options.', { field: `review.answers.${criterion.id}` })
    if (type === 'text' && (typeof answer !== 'string' || answer.length > 5000)) throw new ApiError(422, 'VALIDATION_ERROR', 'A text rubric answer must be at most 5,000 characters.', { field: `review.answers.${criterion.id}` })
  }
  const note = typeof body.review.note === 'string' ? body.review.note.slice(0, 5000) : ''
  const status = body.assignmentStatus || (body.abstain === true ? 'abstained' : 'completed')
  if (!new Set(['assigned', 'in-progress', 'completed', 'abstained']).has(status)) throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid assignment status.', { field: 'assignmentStatus' })
  const timestamp = now()
  const reviewId = `review-${assignment.id}`
  const review = { id: reviewId, assignmentId: assignment.id, submissionId: body.submissionId, reviewerName: access.user.name || access.user.email, reviewerEmail: access.user.email, reviewerUserId: access.user.id, scores, answers: { ...answers, ...scores }, note, abstained: body.abstain === true, updatedAt: timestamp }
  const existingReviews = Array.isArray(loaded.state.reviews) ? loaded.state.reviews : []
  const reviewsWithoutAssignment = existingReviews.filter((item) => item.id !== reviewId && item.assignmentId !== assignment.id)
  const nextState = {
    ...loaded.state,
    lastUpdatedAt: timestamp,
    reviews: status === 'completed' ? [...reviewsWithoutAssignment, review] : reviewsWithoutAssignment,
    evaluationAssignments: assignments.map((item) => item.id === assignment.id ? { ...item, status, abstain: body.abstain === true, abstainReason: body.abstain === true ? note.replace(/^Abstained:\s*/i, '') : undefined, completedAt: status === 'completed' || status === 'abstained' ? timestamp : undefined, updatedAt: timestamp } : item),
  }
  validateAppStateDocument(nextState, eventId)
  const updated = await persistStateRevision(env, { workspaceId, eventId, state: nextState, expectedRevision: body.expectedRevision, userId: access.user.id, timestamp, reason: 'reviewer score update' })
  if (!updated) throw new ApiError(409, 'REVISION_CONFLICT', 'Review data has changed since it was loaded.', { expectedRevision: body.expectedRevision })
  await audit(env, workspaceId, access.user.id, 'review.upserted', 'submission', body.submissionId, { assignmentId: assignment.id, status, revision: updated.revision }, requestId)
  return json({ data: { revision: updated.revision, review, assignment: nextState.evaluationAssignments.find((item) => item.id === assignment.id) } }, 200, request, env, requestId, { ETag: `"${updated.revision}"` })
}

function interpolateReminder(value, event, speaker, task) {
  const tokens = {
    'event.name': event.name || '',
    'event.startAt': event.startAt || '',
    'speaker.firstName': speaker.firstName || '',
    'speaker.lastName': speaker.lastName || '',
    'speaker.email': speaker.email || '',
    'task.title': task.title || '',
    'task.dueAt': task.dueAt || '',
  }
  return String(value || '').replace(/{{\s*([^{}]+?)\s*}}/g, (_match, token) => tokens[token] ?? '')
}

function reminderBucket(schedule, at) {
  if (schedule.cadence === 'once') return schedule.sendAt || schedule.nextRunAt || 'once'
  const date = new Date(at)
  if (schedule.cadence === 'weekly') return `week-${Math.floor(date.getTime() / 604_800_000)}`
  return date.toISOString().slice(0, 10)
}

async function durableKey(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function dueReminderCandidates(state, at) {
  const current = Date.parse(at)
  const speakers = new Map((state.speakers || []).map((speaker) => [speaker.id, speaker]))
  const templates = new Map((state.templates || []).filter((template) => template.enabled !== false).map((template) => [template.id, template]))
  const acceptedSpeakerIds = new Set((state.submissions || []).filter((submission) => submission.status === 'accepted').flatMap((submission) => submission.speakerIds || []))
  const candidates = []
  for (const schedule of state.event?.reminderSchedules || []) {
    if (!schedule?.enabled) continue
    if (schedule.nextRunAt && Date.parse(schedule.nextRunAt) > current) continue
    if (schedule.cadence === 'once' && schedule.sendAt && Date.parse(schedule.sendAt) > current) continue
    const template = templates.get(schedule.templateId)
    if (!template) continue
    for (const task of state.tasks || []) {
      if (task.completedAt || !validIsoDate(task.dueAt)) continue
      const threshold = Date.parse(task.dueAt) - Math.max(0, Number(schedule.daysBeforeDue) || 0) * 86_400_000
      if (current < threshold) continue
      if (schedule.audience === 'overdue-tasks' && current < Date.parse(task.dueAt)) continue
      const speaker = speakers.get(task.speakerId)
      if (!speaker || !validEmail(speaker.email) || speaker.status === 'declined') continue
      if (schedule.audience === 'confirmed' && speaker.status !== 'confirmed') continue
      if (schedule.audience === 'accepted' && !acceptedSpeakerIds.has(speaker.id)) continue
      if (schedule.audience === 'custom') continue
      candidates.push({ schedule, template, speaker, task })
    }
  }
  return candidates
}

async function runDueRemindersForEvent(env, workspaceId, eventId, requestId, { at = now(), startedBy = 'system', runKey } = {}) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new ApiError(503, 'PROVIDER_NOT_CONFIGURED', 'Configure RESEND_API_KEY and EMAIL_FROM to deliver scheduled reminders.', { provider: 'resend' })
  const loaded = await loadedEventState(env, workspaceId, eventId)
  const candidates = dueReminderCandidates(loaded.state, at)
  const automationKey = runKey || `reminders:${workspaceId}:${eventId}:${at.slice(0, 16)}`
  const scopeKey = automationScopeKey(workspaceId, eventId)
  const storageKey = storedAutomationKey(scopeKey, automationKey)
  const candidateRunId = id('automation')
  const createdAt = now()
  await env.DB.prepare(`INSERT OR IGNORE INTO automation_runs (id,workspace_id,event_id,scope_key,kind,idempotency_key,status,result_json,started_by,created_at) VALUES (?,?,?,?,'reminders',?,'running','{}',?,?)`).bind(candidateRunId, workspaceId, eventId, scopeKey, storageKey, startedBy, createdAt).run()
  const run = await env.DB.prepare(`SELECT id,status,result_json,error_message FROM automation_runs WHERE workspace_id=? AND event_id=? AND scope_key=? AND kind='reminders' AND idempotency_key=?`).bind(workspaceId, eventId, scopeKey, storageKey).first()
  if (!run) throw new ApiError(500, 'AUTOMATION_RUN_MISSING', 'The reminder run could not be created.')
  if (run.id !== candidateRunId && run.status !== 'running') return { runId: run.id, status: run.status, replayed: true, result: parseJsonColumn(run.result_json, {}), errorMessage: run.error_message }
  const lease = await claimAutomationLease(env, run.id, createdAt)
  if (!lease) return { runId: run.id, status: 'running', replayed: true, inProgress: true, result: parseJsonColumn(run.result_json, {}) }
  const resumed = run.id !== candidateRunId
  const deliveries = []
  for (const candidate of candidates) {
    await renewAutomationLease(env, run.id, lease.leaseToken)
    const deliveryKey = `reminder-${await durableKey(`${workspaceId}:${eventId}:${candidate.schedule.id}:${candidate.task.id}:${reminderBucket(candidate.schedule, at)}`)}`
    const candidateDeliveryId = id('reminder')
    const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO reminder_deliveries (id,run_id,workspace_id,event_id,schedule_id,task_id,speaker_id,recipient_email,idempotency_key,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'queued',?,?)`).bind(candidateDeliveryId, run.id, workspaceId, eventId, candidate.schedule.id, candidate.task.id, candidate.speaker.id, candidate.speaker.email.toLowerCase(), deliveryKey, createdAt, createdAt).run()
    const durableDelivery = await env.DB.prepare(`SELECT id,status FROM reminder_deliveries WHERE workspace_id=? AND event_id=? AND idempotency_key=?`).bind(workspaceId, eventId, deliveryKey).first()
    if (!durableDelivery) throw new ApiError(500, 'REMINDER_DELIVERY_MISSING', 'The durable reminder delivery could not be loaded.')
    const deliveryId = durableDelivery.id
    if (Number(inserted?.meta?.changes ?? 0) < 1) {
      if (durableDelivery.status !== 'queued') {
        deliveries.push({ speakerId: candidate.speaker.id, taskId: candidate.task.id, status: 'skipped' })
        continue
      }
    }
    const subject = interpolateReminder(candidate.template.subject, loaded.state.event, candidate.speaker, candidate.task)
    const text = interpolateReminder(candidate.template.body, loaded.state.event, candidate.speaker, candidate.task)
    const calendarAttachment = resendCalendarAttachment(speakerCalendarInvite(loaded.state, candidate.speaker, env.EMAIL_FROM), 'speaker-schedule.ics')
    try {
      const response = await fetchWithTimeout('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': deliveryKey }, body: JSON.stringify({ from: env.EMAIL_FROM, to: [candidate.speaker.email], subject, text, attachments: calendarAttachment ? [calendarAttachment] : undefined }) }, env)
      const provider = await providerPayload(response)
      if (!response.ok) throw new Error(provider.message || `Resend returned HTTP ${response.status}`)
      await env.DB.prepare(`UPDATE reminder_deliveries SET status='sent',provider_message_id=?,updated_at=? WHERE id=?`).bind(provider.id || null, now(), deliveryId).run()
      deliveries.push({ speakerId: candidate.speaker.id, taskId: candidate.task.id, deliveryId, status: 'sent', providerMessageId: provider.id })
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : 'Reminder delivery failed.'
      await env.DB.prepare(`UPDATE reminder_deliveries SET status='failed',error_message=?,updated_at=? WHERE id=?`).bind(message, now(), deliveryId).run()
      deliveries.push({ speakerId: candidate.speaker.id, taskId: candidate.task.id, deliveryId, status: 'failed', error: message })
    }
  }
  const sent = deliveries.filter((delivery) => delivery.status === 'sent').length
  const failed = deliveries.filter((delivery) => delivery.status === 'failed').length
  const skipped = deliveries.filter((delivery) => delivery.status === 'skipped').length
  const status = failed === 0 ? 'succeeded' : sent > 0 ? 'partial' : 'failed'
  const result = { evaluated: candidates.length, sent, failed, skipped, resumed, deliveries }
  await env.DB.prepare(`UPDATE automation_runs SET status=?,result_json=?,error_message=?,completed_at=? WHERE id=?`).bind(status, JSON.stringify(result), failed ? 'One or more reminder deliveries failed.' : null, now(), run.id).run()
  await env.DB.prepare(`DELETE FROM automation_leases WHERE run_id=? AND lease_token=?`).bind(run.id, lease.leaseToken).run()
  await audit(env, workspaceId, startedBy === 'system' ? null : startedBy, 'automation.reminders.completed', 'event', eventId, { runId: run.id, status, sent, failed, skipped }, requestId)
  return { runId: run.id, status, replayed: false, result }
}

async function reminderAutomation(request, env, requestId, workspaceId, eventId, action) {
  const access = await identityAndMembership(request, env, workspaceId, 'organizer')
  if (request.method === 'GET' && !action) {
    const loaded = await loadedEventState(env, workspaceId, eventId)
  const runs = await env.DB.prepare(`SELECT id,scope_key,idempotency_key,status,result_json,error_message,started_by,created_at,completed_at FROM automation_runs WHERE workspace_id=? AND event_id=? AND kind='reminders' ORDER BY created_at DESC LIMIT 100`).bind(workspaceId, eventId).all()
    const deliveries = await env.DB.prepare(`SELECT id,run_id,schedule_id,task_id,speaker_id,recipient_email,status,provider_message_id,error_message,created_at,updated_at FROM reminder_deliveries WHERE workspace_id=? AND event_id=? ORDER BY created_at DESC LIMIT 250`).bind(workspaceId, eventId).all()
    return json({ data: { configured: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM), schedules: loaded.state.event?.reminderSchedules || [], runs: (runs.results || []).map((run) => ({ ...run, idempotency_key: publicAutomationKey(run.scope_key, run.idempotency_key), scope_key: undefined, result: parseJsonColumn(run.result_json, {}), result_json: undefined })), deliveries: deliveries.results || [] } }, 200, request, env, requestId)
  }
  if (request.method !== 'POST' || action !== 'run') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'GET, POST' })
  const body = await jsonBody(request, 20_000)
  const at = body.at === undefined ? now() : validIsoDate(body.at) ? new Date(body.at).toISOString() : null
  if (!at) throw new ApiError(422, 'VALIDATION_ERROR', 'at must be a valid ISO date-time.', { field: 'at' })
  const runKey = body.idempotencyKey === undefined ? undefined : idempotencyKey(body.idempotencyKey)
  const result = await runDueRemindersForEvent(env, workspaceId, eventId, requestId, { at, startedBy: access.user.id, runKey })
  return json({ data: result }, result.replayed ? 200 : result.status === 'failed' ? 502 : result.status === 'partial' ? 207 : 200, request, env, requestId)
}

async function runRetentionCleanup(env, requestId, startedBy = 'system', at = now()) {
  const day = at.slice(0, 10)
  const candidateRunId = id('automation')
  const key = `retention:${day}`
  const scopeKey = automationScopeKey()
  const storageKey = storedAutomationKey(scopeKey, key)
  await env.DB.prepare(`INSERT OR IGNORE INTO automation_runs (id,scope_key,kind,idempotency_key,status,result_json,started_by,created_at) VALUES (?,?,'retention',?,'running','{}',?,?)`).bind(candidateRunId, scopeKey, storageKey, startedBy, at).run()
  const run = await env.DB.prepare(`SELECT id,status,result_json FROM automation_runs WHERE scope_key=? AND kind='retention' AND idempotency_key=?`).bind(scopeKey, storageKey).first()
  if (run.id !== candidateRunId) return { runId: run.id, status: run.status, replayed: true, result: parseJsonColumn(run.result_json, {}) }
  const cutoff = (days) => new Date(Date.parse(at) - days * 86_400_000).toISOString()
  const changes = {}
  const operations = [
    ['rateLimitBuckets', env.DB.prepare(`DELETE FROM rate_limit_buckets WHERE window_start<?`).bind(Math.floor(Date.parse(at) / 1000) - Math.max(1, Number(env.RATE_LIMIT_RETENTION_DAYS) || 2) * 86_400)],
    ['closedCfpSubmissions', env.DB.prepare(`DELETE FROM public_submissions WHERE updated_at<? AND event_id IN (SELECT id FROM events WHERE cfp_open=0)`).bind(cutoff(Math.max(30, Number(env.CFP_RETENTION_DAYS) || 730)))],
    ['integrationRuns', env.DB.prepare(`DELETE FROM integration_runs WHERE created_at<? AND status<>'running'`).bind(cutoff(Math.max(30, Number(env.INTEGRATION_RETENTION_DAYS) || 365)))],
    ['auditEntries', env.DB.prepare(`DELETE FROM audit_log WHERE created_at<?`).bind(cutoff(Math.max(90, Number(env.AUDIT_RETENTION_DAYS) || 730)))],
    ['automationRuns', env.DB.prepare(`DELETE FROM automation_runs WHERE created_at<? AND id<>?`).bind(cutoff(Math.max(30, Number(env.AUTOMATION_RETENTION_DAYS) || 365)), run.id)],
    ['expiredLeases', env.DB.prepare(`DELETE FROM integration_leases WHERE lease_expires_at<?`).bind(cutoff(1))],
  ]
  for (const [name, statement] of operations) {
    const result = await statement.run()
    changes[name] = Number(result?.meta?.changes || 0)
  }
  await env.DB.prepare(`UPDATE automation_runs SET status='succeeded',result_json=?,completed_at=? WHERE id=?`).bind(JSON.stringify(changes), now(), run.id).run()
  return { runId: run.id, status: 'succeeded', replayed: false, result: changes, requestId }
}

async function processMaintenance(env, requestId, at = now()) {
  const retention = await runRetentionCleanup(env, requestId, 'system', at)
  const reminderRuns = []
  const configured = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM)
  const events = await env.DB.prepare(`SELECT e.workspace_id,e.id FROM events e JOIN event_states s ON s.event_id=e.id ORDER BY e.workspace_id,e.id LIMIT 1000`).all()
  for (const event of events.results || []) {
    try {
      if (!configured) {
        const loaded = await loadedEventState(env, event.workspace_id, event.id)
        const dueCount = dueReminderCandidates(loaded.state, at).length
        if (dueCount > 0) reminderRuns.push({ eventId: event.id, status: 'failed', code: 'PROVIDER_NOT_CONFIGURED', error: 'Configure RESEND_API_KEY and EMAIL_FROM to deliver due reminders.', dueCount })
        continue
      }
      reminderRuns.push(await runDueRemindersForEvent(env, event.workspace_id, event.id, requestId, { at, startedBy: 'system', runKey: `scheduled:${event.workspace_id}:${event.id}:${at.slice(0, 16)}` }))
    } catch (error) {
      reminderRuns.push({ eventId: event.id, status: 'failed', error: error instanceof Error ? error.message : String(error) })
    }
  }
  const failureCount = reminderRuns.filter((run) => run.status === 'failed' || run.status === 'partial').length
  return { at, retention, remindersConfigured: configured, ok: failureCount === 0, failureCount, reminderRuns }
}

async function internalMaintenance(request, env, requestId) {
  if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'POST' })
  if (!env.CRON_SECRET || env.CRON_SECRET.length < 24) throw new ApiError(503, 'MAINTENANCE_NOT_CONFIGURED', 'Configure a strong CRON_SECRET for the maintenance trigger.')
  if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) throw new ApiError(401, 'MAINTENANCE_AUTH_REQUIRED', 'A valid maintenance bearer token is required.')
  const body = await jsonBody(request, 10_000)
  const at = body.at === undefined ? now() : validIsoDate(body.at) ? new Date(body.at).toISOString() : null
  if (!at) throw new ApiError(422, 'VALIDATION_ERROR', 'at must be a valid ISO date-time.', { field: 'at' })
  const result = await processMaintenance(env, requestId, at)
  const status = result.failureCount > 0 ? result.remindersConfigured ? 502 : 503 : 200
  return json({ data: result }, status, request, env, requestId)
}

async function auditList(request, env, requestId, workspaceId) {
  await identityAndMembership(request, env, workspaceId, 'organizer')
  if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'GET' })
  const result = await env.DB.prepare(`SELECT id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,created_at FROM audit_log WHERE workspace_id=? ORDER BY created_at DESC LIMIT 250`).bind(workspaceId).all()
  return json({ data: (result.results || []).map((entry) => ({ ...entry, metadata: parseJsonColumn(entry.metadata_json, {}), metadata_json: undefined })) }, 200, request, env, requestId)
}

async function routeApi(request, env, requestId) {
  await ensureSchema(env)
  const url = new URL(request.url)
  if (request.method === 'OPTIONS') {
    if (request.headers.get('origin') && !trustedOrigin(request, env)) throw new ApiError(403, 'ORIGIN_FORBIDDEN', 'Origin is not allowed.')
    const headers = responseHeaders(request, env, requestId)
    headers.set('Access-Control-Allow-Headers', 'Content-Type, If-Match, X-File-Name, OAI-Authenticated-User-Id, OAI-Authenticated-User-Email, OAI-Authenticated-User-Full-Name, OAI-Authenticated-User-Full-Name-Encoding, X-OpenSpeaker-Workspace-Name')
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    headers.set('Access-Control-Max-Age', '600')
    return new Response(null, { status: 204, headers })
  }
  if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') && !trustedOrigin(request, env)) throw new ApiError(403, 'ORIGIN_FORBIDDEN', 'Origin is not allowed for mutation requests.')
  if (url.pathname === '/api/health' && request.method === 'GET') {
    await env.DB.prepare('SELECT 1 AS ok').first()
    return json({ data: { status: 'ok', database: 'ok', files: Boolean(env.FILES), timestamp: now() } }, 200, request, env, requestId)
  }
  if (url.pathname === '/api/internal/maintenance') return internalMaintenance(request, env, requestId)

  let match = url.pathname.match(/^\/api\/public\/cfp\/([^/]+)\/([^/]+)$/)
  if (match) return publicCfp(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]))
  match = url.pathname.match(/^\/api\/public\/events\/([^/]+)\/([^/]+)\/state$/)
  if (match) return publicEventState(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]))
  match = url.pathname.match(/^\/api\/public\/events\/([^/]+)\/([^/]+)\/speakers\/([^/]+)\/headshot$/)
  if (match) return publicSpeakerHeadshot(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]), decodeURIComponent(match[3]))
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/session$/)
  if (match) return workspaceSession(request, env, requestId, decodeURIComponent(match[1]))
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/events$/)
  if (match) return workspaceEvents(request, env, requestId, decodeURIComponent(match[1]))
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/events\/([^/]+)\/state\/history(?:\/(\d+))?$/)
  if (match) return eventStateHistory(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]), match[3])
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/events\/([^/]+)\/state\/rollback$/)
  if (match) return rollbackEventState(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]))
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/events\/([^/]+)\/state$/)
  if (match) return eventState(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]))
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/events\/([^/]+)\/reviewer-queue$/)
  if (match) return reviewerQueue(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]))
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/events\/([^/]+)\/speaker-portal\/submissions(?:\/([^/]+))?$/)
  if (match) return speakerProposalMutation(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]), match[3] ? decodeURIComponent(match[3]) : undefined)
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/events\/([^/]+)\/speaker-portal$/)
  if (match) return speakerPortal(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]))
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/events\/([^/]+)\/reviews$/)
  if (match) return reviewerMutation(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]))
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/events\/([^/]+)\/integrations$/)
  if (match) return integrationStatus(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]))
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/events\/([^/]+)\/integrations\/email\/send$/)
  if (match) return sendEmailIntegration(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]))
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/events\/([^/]+)\/integrations\/accelevents\/sync$/)
  if (match) return syncAccelevents(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]))
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/events\/([^/]+)\/reminders(?:\/(run))?$/)
  if (match) return reminderAutomation(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]), match[3])
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/members(?:\/([^/]+))?$/)
  if (match) return members(request, env, requestId, decodeURIComponent(match[1]), match[2] ? decodeURIComponent(match[2]) : undefined)
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/events\/([^/]+)\/submissions(?:\/([^/]+))?$/)
  if (match) return submissions(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]), match[3] ? decodeURIComponent(match[3]) : undefined)
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/events\/([^/]+)\/assets(?:\/([^/]+))?$/)
  if (match) return assets(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]), match[3] ? decodeURIComponent(match[3]) : undefined)
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/audit$/)
  if (match) return auditList(request, env, requestId, decodeURIComponent(match[1]))
  throw new ApiError(404, 'API_ROUTE_NOT_FOUND', 'API route was not found.')
}

async function fetchHandler(request, env) {
  const requestId = request.headers.get('x-request-id')?.slice(0, 128) || crypto.randomUUID()
  if (new URL(request.url).pathname.startsWith('/api/')) {
    try {
      return await routeApi(request, env, requestId)
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR', 'An unexpected server error occurred.')
      if (!(error instanceof ApiError)) console.error(JSON.stringify({ requestId, error: String(error), stack: error?.stack }))
      return json({ error: { code: apiError.code, message: apiError.message, details: apiError.details, requestId } }, apiError.status, request, env, requestId, apiError.headers)
    }
  }
  const response = await env.ASSETS.fetch(request)
  if (response.status !== 404 || request.method !== 'GET') return response
  if (!request.headers.get('accept')?.includes('text/html')) return response
  return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request))
}

async function scheduledHandler(controller, env, ctx) {
  await ensureSchema(env)
  const requestId = `scheduled-${crypto.randomUUID()}`
  const at = new Date(controller?.scheduledTime || Date.now()).toISOString()
  const work = processMaintenance(env, requestId, at).then((result) => {
    if (result.failureCount > 0) throw new Error(`Maintenance failed for ${result.failureCount} event reminder run(s).`)
    return result
  })
  if (ctx?.waitUntil) ctx.waitUntil(work)
  return work
}

const worker = { fetch: fetchHandler, scheduled: scheduledHandler }
export default worker
export { MIGRATION_VERSIONS, SCHEMA_STATEMENTS, fetchHandler, scheduledHandler }
