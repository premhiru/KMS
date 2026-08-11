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
]

const ROLE_LEVEL = { speaker: 1, reviewer: 2, organizer: 3, owner: 4 }
const ALLOWED_ROLES = new Set(Object.keys(ROLE_LEVEL))
const ALLOWED_ASSET_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])
export const EVENT_STATE_UPSERT_SQL = `INSERT INTO event_states (event_id,revision,state_json,updated_by,updated_at) SELECT ?,1,?,?,? WHERE (?=0 OR EXISTS (SELECT 1 FROM event_states WHERE event_id=? AND revision=?)) AND EXISTS (SELECT 1 FROM events WHERE id=? AND workspace_id=?) ON CONFLICT(event_id) DO UPDATE SET revision=event_states.revision+1,state_json=excluded.state_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at WHERE event_states.revision=? RETURNING revision`
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
  const formats = Array.isArray(config.formats) ? config.formats : []
  const routing = Array.isArray(config.categoryRouting) ? config.categoryRouting.find((route) => route?.category === body.category || route?.categoryId === body.category || route?.id === body.category) : undefined
  const track = typeof body.track === 'string' && body.track.trim() ? body.track.trim() : typeof routing?.track === 'string' ? routing.track : ''
  const format = typeof body.format === 'string' ? body.format.trim() : ''
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
    title, abstract, speakerName, speakerEmail: body.speakerEmail.trim().toLowerCase(), track, format, consent: true,
    coSpeakers: normalizedCoSpeakers,
    customAnswers: (body.customAnswers || body.answers) && typeof (body.customAnswers || body.answers) === 'object' && !Array.isArray(body.customAnswers || body.answers) ? (body.customAnswers || body.answers) : {},
  }
}

export function validateStateWrite(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'INVALID_JSON_BODY', 'A JSON object is required.')
  if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) throw new ApiError(422, 'VALIDATION_ERROR', 'expectedRevision must be a non-negative integer.', { field: 'expectedRevision' })
  if (!body.event || typeof body.event !== 'object' || Array.isArray(body.event)) throw new ApiError(422, 'VALIDATION_ERROR', 'event metadata is required.', { field: 'event' })
  const name = requiredString(body.event.name, 'event.name', 2, 120)
  const slug = requiredString(body.event.slug, 'event.slug', 2, 80).toLowerCase()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new ApiError(422, 'VALIDATION_ERROR', 'event.slug must be URL-safe lowercase text.', { field: 'event.slug' })
  if (!body.state || typeof body.state !== 'object' || Array.isArray(body.state)) throw new ApiError(422, 'VALIDATION_ERROR', 'state must be a JSON object.', { field: 'state' })
  return { expectedRevision: body.expectedRevision, event: { name, slug, cfpOpen: body.event.cfpOpen === true, cfpConfig: body.event.cfpConfig ?? {} }, state: body.state }
}

async function ensureSchema(env) {
  if (!env.DB) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'The D1 binding DB is not configured.')
  let promise = schemaPromises.get(env.DB)
  if (!promise) {
    promise = env.DB.batch(SCHEMA_STATEMENTS.map((statement) => env.DB.prepare(statement)))
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
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO workspaces (id,name,created_at) VALUES (?,?,?)`).bind(workspaceId, request.headers.get('x-openspeaker-workspace-name')?.slice(0, 120) || 'OpenSpeaker workspace', timestamp),
      env.DB.prepare(`INSERT OR IGNORE INTO memberships (workspace_id,user_id,role,created_at) SELECT ?,?,'owner',? WHERE NOT EXISTS (SELECT 1 FROM memberships WHERE workspace_id=?)`).bind(workspaceId, user.id, timestamp, workspaceId),
    ])
  }
  const membership = await env.DB.prepare(`SELECT role FROM memberships WHERE workspace_id=? AND user_id=?`).bind(workspaceId, user.id).first()
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

function stableKey(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
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
  const knownSubmissionIds = new Set(merged.submissions.map((submission) => submission?.id))
  const speakerByEmail = new Map(merged.speakers.filter((speaker) => typeof speaker?.email === 'string').map((speaker) => [speaker.email.trim().toLowerCase(), speaker]))
  let importedCount = 0

  for (const row of rows || []) {
    if (!row?.id || knownSourceIds.has(row.id) || knownSubmissionIds.has(`cfp-${row.id}`)) continue
    const payload = parseJsonColumn(row.payload_json, {})
    const people = [{
      name: row.speaker_name,
      email: row.speaker_email,
      company: payload.company || payload.speakerCompany,
      jobTitle: payload.jobTitle || payload.speakerJobTitle,
      bio: payload.bio || payload.speakerBio,
    }, ...(Array.isArray(payload.coSpeakers) ? payload.coSpeakers : [])]
    const speakerIds = []
    for (const person of people) {
      const email = String(person?.email || '').trim().toLowerCase()
      if (!validEmail(email)) continue
      let speaker = speakerByEmail.get(email)
      if (!speaker) {
        const names = splitName(person.name)
        const speakerId = `speaker-cfp-${stableKey(email)}`
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

async function publicCfp(request, env, requestId, workspaceId, eventSlug) {
  const event = await env.DB.prepare(`SELECT e.id,e.name,e.slug,e.cfp_config,s.revision,s.state_json FROM events e LEFT JOIN event_states s ON s.event_id=e.id WHERE e.workspace_id=? AND e.slug=? AND e.cfp_open=1`).bind(workspaceId, eventSlug).first()
  if (!event) throw new ApiError(404, 'CFP_NOT_FOUND', 'This call for proposals is unavailable or closed.')
  if (request.method === 'GET') return json({ data: { event: { id: event.id, name: event.name, slug: event.slug }, config: parseJsonColumn(event.cfp_config, {}), revision: event.revision || 0, state: event.state_json ? sanitizePublicState(parseJsonColumn(event.state_json, {})) : null } }, 200, request, env, requestId)
  if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'GET, POST' })
  const config = parseJsonColumn(event.cfp_config, {})
  if (config.closeAt && Number.isFinite(Date.parse(config.closeAt)) && Date.now() >= Date.parse(config.closeAt)) throw new ApiError(410, 'CFP_CLOSED', 'This call for proposals has closed.', { closeAt: config.closeAt })
  await enforceSubmissionRateLimit(request, env, workspaceId, event.id)
  const input = validateCfpSubmission(await jsonBody(request, 100_000), config)
  const questions = Array.isArray(config.questions) ? config.questions : Array.isArray(config.customQuestions) ? config.customQuestions : []
  const answers = input.customAnswers || {}
  for (const question of questions) {
    const conditions = Array.isArray(question.conditions) ? question.conditions : question.condition ? [question.condition] : []
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
  const existing = await env.DB.prepare(`SELECT COUNT(*) AS count FROM public_submissions WHERE event_id=? AND lower(speaker_email)=?`).bind(event.id, input.speakerEmail).first()
  const perSpeakerLimit = config.allowMultiple === true ? Math.max(1, Number(config.submissionLimit) || 25) : 1
  if (Number(existing?.count || 0) >= perSpeakerLimit) throw new ApiError(409, 'SUBMISSION_LIMIT_REACHED', 'This speaker has reached the proposal limit for this event.', { limit: perSpeakerLimit, allowMultiple: config.allowMultiple === true })
  const submissionId = id('submission')
  const timestamp = now()
  await env.DB.prepare(`INSERT INTO public_submissions (id,workspace_id,event_id,title,abstract,speaker_name,speaker_email,track,format,consent,status,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,'needs-review',?,?,?)`).bind(submissionId, workspaceId, event.id, input.title, input.abstract, input.speakerName, input.speakerEmail, input.track, input.format, JSON.stringify(input), timestamp, timestamp).run()
  await audit(env, workspaceId, null, 'cfp.submitted', 'submission', submissionId, { eventId: event.id }, requestId)
  return json({ data: { id: submissionId, status: 'needs-review', submittedAt: timestamp } }, 201, request, env, requestId)
}

export function sanitizePublicState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return {}
  const submissions = Array.isArray(state.submissions) ? state.submissions.filter((submission) => submission?.status === 'accepted') : []
  const acceptedIds = new Set(submissions.map((submission) => submission.id))
  const sessions = Array.isArray(state.sessions) ? state.sessions.filter((session) => session?.published === true && acceptedIds.has(session.submissionId)) : []
  const publishedSubmissionIds = new Set(sessions.map((session) => session.submissionId))
  const publicSubmissions = submissions.filter((submission) => publishedSubmissionIds.has(submission.id))
  const speakerIds = new Set(publicSubmissions.flatMap((submission) => Array.isArray(submission.speakerIds) ? submission.speakerIds : []))
  const speakers = Array.isArray(state.speakers) ? state.speakers.filter((speaker) => speaker?.status === 'confirmed' && speakerIds.has(speaker.id)).map((speaker) => ({
    id: speaker.id, firstName: speaker.firstName, lastName: speaker.lastName, company: speaker.company, jobTitle: speaker.jobTitle,
    bio: speaker.bio, pronouns: speaker.pronouns, photoUrl: speaker.photoUrl, status: speaker.status,
    email: '', availability: [], createdAt: speaker.createdAt, updatedAt: speaker.updatedAt,
  })) : []
  return { schemaVersion: state.schemaVersion, lastUpdatedAt: state.lastUpdatedAt, event: state.event, speakers, submissions: publicSubmissions, sessions, reviews: [], tasks: [], templates: [], communicationLog: [] }
}

async function publicEventState(request, env, requestId, workspaceId, eventSlug) {
  if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'GET' })
  const row = await env.DB.prepare(`SELECT e.id,e.name,e.slug,s.revision,s.state_json,s.updated_at FROM events e JOIN event_states s ON s.event_id=e.id WHERE e.workspace_id=? AND e.slug=?`).bind(workspaceId, eventSlug).first()
  if (!row) throw new ApiError(404, 'PUBLIC_EVENT_NOT_FOUND', 'Published event state was not found.')
  return json({ data: { event: { id: row.id, name: row.name, slug: row.slug }, revision: row.revision, state: sanitizePublicState(parseJsonColumn(row.state_json, {})), updatedAt: row.updated_at } }, 200, request, env, requestId, { ETag: `"${row.revision}"` })
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
  const input = validateStateWrite(await jsonBody(request))
  const timestamp = now()
  const eventQuery = env.DB.prepare(`INSERT INTO events (id,workspace_id,name,slug,cfp_open,cfp_config,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE (?=0 AND NOT EXISTS (SELECT 1 FROM event_states WHERE event_id=?)) OR EXISTS (SELECT 1 FROM event_states WHERE event_id=? AND revision=?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,cfp_open=excluded.cfp_open,cfp_config=excluded.cfp_config,updated_at=excluded.updated_at WHERE events.workspace_id=excluded.workspace_id AND ((?=0 AND NOT EXISTS (SELECT 1 FROM event_states WHERE event_id=excluded.id)) OR EXISTS (SELECT 1 FROM event_states WHERE event_id=excluded.id AND revision=?)) RETURNING id`).bind(eventId, workspaceId, input.event.name, input.event.slug, input.event.cfpOpen ? 1 : 0, JSON.stringify(input.event.cfpConfig), timestamp, timestamp, input.expectedRevision, eventId, eventId, input.expectedRevision, input.expectedRevision, input.expectedRevision)
  const stateQuery = env.DB.prepare(EVENT_STATE_UPSERT_SQL).bind(eventId, JSON.stringify(input.state), access.user.id, timestamp, input.expectedRevision, eventId, input.expectedRevision, eventId, workspaceId, input.expectedRevision)
  let results
  try {
    results = await env.DB.batch([eventQuery, stateQuery])
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new ApiError(409, 'EVENT_SLUG_CONFLICT', 'That event slug is already in use in this workspace.')
    throw error
  }
  const revision = results[1]?.results?.[0]?.revision
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
  const visibleRounds = rounds.filter((round) => roundIds.has(round.id)).map(({ id: roundId, planId, name, rubric, instructions, status, dueAt, blind }) => ({ id: roundId, planId, name, rubric, instructions, status, dueAt, blind }))
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
  const access = await identityAndMembership(request, env, workspaceId, request.method === 'GET' ? 'reviewer' : 'organizer')
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

async function assets(request, env, requestId, workspaceId, eventId, assetId) {
  const access = await identityAndMembership(request, env, workspaceId, 'speaker')
  if (!env.FILES) throw new ApiError(503, 'FILES_UNAVAILABLE', 'The R2 binding FILES is not configured.')
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
    const event = await env.DB.prepare(`SELECT id FROM events WHERE id=? AND workspace_id=?`).bind(eventId, workspaceId).first()
    if (!event) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event was not found.')
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
    if ((ROLE_LEVEL[access.role] || 0) < ROLE_LEVEL.organizer && record.uploaded_by !== access.user.id) throw new ApiError(403, 'ASSET_FORBIDDEN', 'Only organizers or the uploader may download this asset.')
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

async function providerPayload(response) {
  const text = await response.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { return { message: text.slice(0, 2000) } }
}

function base64Utf8(value) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(binary)
}

async function existingIntegrationRun(env, workspaceId, eventId, provider, key) {
  return env.DB.prepare(`SELECT id,status,response_json,error_code,error_message,created_at,completed_at FROM integration_runs WHERE workspace_id=? AND event_id=? AND provider=? AND idempotency_key=?`).bind(workspaceId, eventId, provider, key).first()
}

async function integrationStatus(request, env, requestId, workspaceId, eventId) {
  await identityAndMembership(request, env, workspaceId, 'organizer')
  if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'GET' })
  const runs = await env.DB.prepare(`SELECT id,provider,action,idempotency_key,status,response_json,error_code,error_message,started_by,created_at,completed_at FROM integration_runs WHERE workspace_id=? AND event_id=? ORDER BY created_at DESC LIMIT 100`).bind(workspaceId, eventId).all()
  const deliveries = await env.DB.prepare(`SELECT id,run_id,idempotency_key,recipient_speaker_id,recipient_email,subject,provider_message_id,status,error_message,created_at,updated_at FROM message_deliveries WHERE workspace_id=? AND event_id=? ORDER BY created_at DESC LIMIT 250`).bind(workspaceId, eventId).all()
  return json({ data: { configured: { resend: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM), accelevents: Boolean(env.ACCELEVENTS_API_URL && env.ACCELEVENTS_API_TOKEN) }, runs: (runs.results || []).map((run) => ({ ...run, response: parseJsonColumn(run.response_json, {}), response_json: undefined })), deliveries: deliveries.results || [] } }, 200, request, env, requestId)
}

async function sendEmailIntegration(request, env, requestId, workspaceId, eventId) {
  const access = await identityAndMembership(request, env, workspaceId, 'organizer')
  if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'POST' })
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new ApiError(503, 'PROVIDER_NOT_CONFIGURED', 'Configure RESEND_API_KEY and EMAIL_FROM to send email.', { provider: 'resend' })
  const body = await jsonBody(request, 1_500_000)
  const key = idempotencyKey(body.idempotencyKey)
  const prior = await existingIntegrationRun(env, workspaceId, eventId, 'resend', key)
  if (prior) return json({ data: { runId: prior.id, status: prior.status, replayed: true, result: parseJsonColumn(prior.response_json, {}), errorCode: prior.error_code, errorMessage: prior.error_message } }, 200, request, env, requestId)
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
      if (!message.attachment || typeof message.attachment !== 'object' || message.attachment.type !== 'text/calendar' || typeof message.attachment.filename !== 'string' || !/^[a-zA-Z0-9._ -]{1,120}\.ics$/i.test(message.attachment.filename) || typeof message.attachment.content !== 'string' || message.attachment.content.length > 200_000 || !message.attachment.content.includes('BEGIN:VCALENDAR')) throw new ApiError(422, 'INVALID_CALENDAR_ATTACHMENT', 'attachment must be a valid text/calendar .ics payload under 200 KB.', { field: `messages.${index}.attachment` })
      attachment = { filename: message.attachment.filename, content: base64Utf8(message.attachment.content), content_type: 'text/calendar; charset=utf-8' }
    }
    return { speaker, subject, text, html, attachment }
  })
  const runId = id('run')
  const timestamp = now()
  await env.DB.prepare(`INSERT INTO integration_runs (id,workspace_id,event_id,provider,action,idempotency_key,status,request_json,response_json,started_by,created_at) VALUES (?,?,?,'resend','email.send',?,'running',?,'{}',?,?)`).bind(runId, workspaceId, eventId, key, JSON.stringify({ messageCount: messages.length, speakerIds: messages.map((item) => item.speaker.id) }), access.user.id, timestamp).run()
  const results = []
  for (const [index, message] of messages.entries()) {
    const deliveryId = id('delivery')
    const deliveryKey = `${key}:${index}`
    await env.DB.prepare(`INSERT INTO message_deliveries (id,run_id,workspace_id,event_id,idempotency_key,recipient_speaker_id,recipient_email,subject,status,requested_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?, 'queued',?,?,?)`).bind(deliveryId, runId, workspaceId, eventId, deliveryKey, message.speaker.id, message.speaker.email.toLowerCase(), message.subject, access.user.id, timestamp, timestamp).run()
    try {
      const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': deliveryKey }, body: JSON.stringify({ from: env.EMAIL_FROM, to: [message.speaker.email], subject: message.subject, text: message.text || undefined, html: message.html || undefined, reply_to: body.replyTo || undefined, attachments: message.attachment ? [message.attachment] : undefined }) })
      const provider = await providerPayload(response)
      if (!response.ok) throw new Error(provider.message || `Resend returned HTTP ${response.status}`)
      await env.DB.prepare(`UPDATE message_deliveries SET status='sent',provider_message_id=?,updated_at=? WHERE id=?`).bind(provider.id || null, now(), deliveryId).run()
      results.push({ speakerId: message.speaker.id, deliveryId, status: 'sent', providerMessageId: provider.id })
    } catch (error) {
      const messageText = error instanceof Error ? error.message.slice(0, 1000) : 'Email delivery failed.'
      await env.DB.prepare(`UPDATE message_deliveries SET status='failed',error_message=?,updated_at=? WHERE id=?`).bind(messageText, now(), deliveryId).run()
      results.push({ speakerId: message.speaker.id, deliveryId, status: 'failed', error: messageText })
    }
  }
  const sent = results.filter((result) => result.status === 'sent').length
  const status = sent === results.length ? 'sent' : sent === 0 ? 'failed' : 'partial'
  const resultPayload = { sent, failed: results.length - sent, deliveries: results }
  await env.DB.prepare(`UPDATE integration_runs SET status=?,response_json=?,error_code=?,error_message=?,completed_at=? WHERE id=?`).bind(status, JSON.stringify(resultPayload), status === 'sent' ? null : 'DELIVERY_FAILED', status === 'sent' ? null : 'One or more messages failed.', now(), runId).run()
  await audit(env, workspaceId, access.user.id, 'integration.email.completed', 'event', eventId, { runId, status, sent, failed: results.length - sent }, requestId)
  return json({ data: { runId, status, replayed: false, result: resultPayload } }, status === 'failed' ? 502 : status === 'partial' ? 207 : 200, request, env, requestId)
}

export function acceleventsReadModel(state, eventId) {
  const accepted = (state.submissions || []).filter((submission) => submission.status === 'accepted')
  const acceptedIds = new Set(accepted.map((submission) => submission.id))
  const sessions = (state.sessions || []).filter((session) => session.published && acceptedIds.has(session.submissionId))
  const publishedIds = new Set(sessions.map((session) => session.submissionId))
  const submissions = accepted.filter((submission) => publishedIds.has(submission.id))
  const speakerIds = new Set(submissions.flatMap((submission) => submission.speakerIds || []))
  const speakers = (state.speakers || []).filter((speaker) => speaker.status === 'confirmed' && speakerIds.has(speaker.id)).map(({ id: speakerId, firstName, lastName, email, company, jobTitle, bio, photoUrl }) => ({ id: speakerId, firstName, lastName, email, company, jobTitle, bio, photoUrl }))
  return { eventId, event: state.event, sessions, submissions, speakers }
}

async function syncAccelevents(request, env, requestId, workspaceId, eventId) {
  const access = await identityAndMembership(request, env, workspaceId, 'organizer')
  if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'POST' })
  if (!env.ACCELEVENTS_API_URL || !env.ACCELEVENTS_API_TOKEN) throw new ApiError(503, 'PROVIDER_NOT_CONFIGURED', 'Configure ACCELEVENTS_API_URL and ACCELEVENTS_API_TOKEN to sync.', { provider: 'accelevents' })
  const body = await jsonBody(request, 20_000)
  const key = idempotencyKey(body.idempotencyKey)
  const prior = await existingIntegrationRun(env, workspaceId, eventId, 'accelevents', key)
  if (prior) return json({ data: { runId: prior.id, status: prior.status, replayed: true, result: parseJsonColumn(prior.response_json, {}) } }, 200, request, env, requestId)
  const loaded = await loadedEventState(env, workspaceId, eventId)
  const payload = acceleventsReadModel(loaded.state, eventId)
  const runId = id('run')
  const timestamp = now()
  await env.DB.prepare(`INSERT INTO integration_runs (id,workspace_id,event_id,provider,action,idempotency_key,status,request_json,response_json,started_by,created_at) VALUES (?,?,?,'accelevents','program.sync',?,'running',?,'{}',?,?)`).bind(runId, workspaceId, eventId, key, JSON.stringify({ sessionCount: payload.sessions.length, speakerCount: payload.speakers.length }), access.user.id, timestamp).run()
  let responsePayload = {}
  try {
    const response = await fetch(env.ACCELEVENTS_API_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.ACCELEVENTS_API_TOKEN}`, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(payload) })
    responsePayload = await providerPayload(response)
    if (!response.ok) throw new Error(responsePayload.message || `Accelevents returned HTTP ${response.status}`)
    await env.DB.prepare(`UPDATE integration_runs SET status='succeeded',response_json=?,completed_at=? WHERE id=?`).bind(JSON.stringify(responsePayload), now(), runId).run()
    await audit(env, workspaceId, access.user.id, 'integration.accelevents.succeeded', 'event', eventId, { runId, sessionCount: payload.sessions.length }, requestId)
    return json({ data: { runId, status: 'succeeded', replayed: false, result: responsePayload, synced: { sessions: payload.sessions.length, speakers: payload.speakers.length } } }, 200, request, env, requestId)
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : 'Accelevents sync failed.'
    await env.DB.prepare(`UPDATE integration_runs SET status='failed',response_json=?,error_code='PROVIDER_ERROR',error_message=?,completed_at=? WHERE id=?`).bind(JSON.stringify(responsePayload), message, now(), runId).run()
    await audit(env, workspaceId, access.user.id, 'integration.accelevents.failed', 'event', eventId, { runId, message }, requestId)
    throw new ApiError(502, 'PROVIDER_ERROR', 'Accelevents sync failed.', { runId, providerMessage: message })
  }
}

function ownSpeaker(state, user) {
  return (state.speakers || []).find((speaker) => typeof speaker.email === 'string' && speaker.email.trim().toLowerCase() === user.email)
}

function projectSpeakerPortal(state, speaker, assetsForUser) {
  const submissions = (state.submissions || []).filter((submission) => (submission.speakerIds || []).includes(speaker.id))
  const submissionIds = new Set(submissions.map((submission) => submission.id))
  const resources = (Array.isArray(state.event?.resources) ? state.event.resources : []).filter((resource) => !Array.isArray(resource?.speakerIds) || resource.speakerIds.includes(speaker.id)).map(({ id: resourceId, title, body, embedUrl, description, url, type }) => ({ id: resourceId, title, body, embedUrl, description, url, type }))
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
  if (request.method === 'GET') return json({ data: { revision: loaded.row.revision, portal: projectSpeakerPortal(loaded.state, speaker, assetProjection) } }, 200, request, env, requestId, { ETag: `"${loaded.row.revision}"` })
  if (request.method !== 'PATCH') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', undefined, { Allow: 'GET, PATCH' })
  const body = await jsonBody(request, 200_000)
  if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision !== loaded.row.revision) throw new ApiError(409, 'REVISION_CONFLICT', 'Speaker data has changed since it was loaded.', { expectedRevision: body.expectedRevision, currentRevision: loaded.row.revision })
  const profile = body.profile && typeof body.profile === 'object' && !Array.isArray(body.profile) ? body.profile : {}
  const allowedText = { firstName: 80, lastName: 80, company: 160, jobTitle: 160, bio: 5000, pronouns: 80, photoUrl: 2000 }
  const profilePatch = {}
  for (const [field, max] of Object.entries(allowedText)) {
    if (profile[field] !== undefined) {
      if (typeof profile[field] !== 'string' || profile[field].length > max) throw new ApiError(422, 'VALIDATION_ERROR', `${field} is invalid.`, { field: `profile.${field}` })
      profilePatch[field] = profile[field].trim()
    }
  }
  if (profilePatch.photoUrl && !/^https:\/\//i.test(profilePatch.photoUrl)) throw new ApiError(422, 'VALIDATION_ERROR', 'photoUrl must use HTTPS.', { field: 'profile.photoUrl' })
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
      asset = { id: assetRow.id, name: assetRow.file_name, type: assetRow.content_type, size: assetRow.size_bytes, selectedAt: assetRow.created_at }
    }
    taskMap.set(task.id, { ...task, completedAt: update.completed === true ? now() : update.completed === false ? undefined : task.completedAt, asset: asset || task.asset, updatedAt: now() })
  }
  const timestamp = now()
  const nextState = {
    ...loaded.state,
    lastUpdatedAt: timestamp,
    speakers: loaded.state.speakers.map((item) => item.id === speaker.id ? { ...item, ...profilePatch, updatedAt: timestamp } : item),
    tasks: (loaded.state.tasks || []).map((task) => taskMap.get(task.id) || task),
  }
  const updated = await env.DB.prepare(EVENT_STATE_UPSERT_SQL).bind(eventId, JSON.stringify(nextState), access.user.id, timestamp, body.expectedRevision, eventId, body.expectedRevision, eventId, workspaceId, body.expectedRevision).first()
  if (!updated) throw new ApiError(409, 'REVISION_CONFLICT', 'Speaker data has changed since it was loaded.', { expectedRevision: body.expectedRevision })
  await audit(env, workspaceId, access.user.id, 'speaker.portal.updated', 'speaker', speaker.id, { taskIds: taskUpdates.map((update) => update.id), profileFields: Object.keys(profilePatch), revision: updated.revision }, requestId)
  const updatedSpeaker = nextState.speakers.find((item) => item.id === speaker.id)
  return json({ data: { revision: updated.revision, portal: projectSpeakerPortal(nextState, updatedSpeaker, assetProjection) } }, 200, request, env, requestId, { ETag: `"${updated.revision}"` })
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
  const scores = body.review?.scores
  if (!scores || typeof scores !== 'object' || Array.isArray(scores) || Object.keys(scores).length < 1 || Object.keys(scores).length > 20 || !Object.values(scores).every((score) => typeof score === 'number' && score >= 1 && score <= 5)) throw new ApiError(422, 'VALIDATION_ERROR', 'review.scores must contain 1–20 scores from 1 to 5.', { field: 'review.scores' })
  const note = typeof body.review.note === 'string' ? body.review.note.slice(0, 5000) : ''
  const status = body.assignmentStatus || (body.abstain === true ? 'abstained' : 'completed')
  if (!new Set(['assigned', 'in-progress', 'completed', 'abstained']).has(status)) throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid assignment status.', { field: 'assignmentStatus' })
  const timestamp = now()
  const reviewId = `review-${assignment.id}`
  const review = { id: reviewId, assignmentId: assignment.id, submissionId: body.submissionId, reviewerName: access.user.name || access.user.email, reviewerEmail: access.user.email, reviewerUserId: access.user.id, scores, note, abstained: body.abstain === true, updatedAt: timestamp }
  const existingReviews = Array.isArray(loaded.state.reviews) ? loaded.state.reviews : []
  const nextState = {
    ...loaded.state,
    lastUpdatedAt: timestamp,
    reviews: existingReviews.some((item) => item.id === reviewId) ? existingReviews.map((item) => item.id === reviewId ? review : item) : [...existingReviews, review],
    evaluationAssignments: assignments.map((item) => item.id === assignment.id ? { ...item, status, abstain: body.abstain === true, abstainReason: body.abstain === true ? note.replace(/^Abstained:\s*/i, '') : undefined, completedAt: status === 'completed' || status === 'abstained' ? timestamp : undefined, updatedAt: timestamp } : item),
  }
  const updated = await env.DB.prepare(EVENT_STATE_UPSERT_SQL).bind(eventId, JSON.stringify(nextState), access.user.id, timestamp, body.expectedRevision, eventId, body.expectedRevision, eventId, workspaceId, body.expectedRevision).first()
  if (!updated) throw new ApiError(409, 'REVISION_CONFLICT', 'Review data has changed since it was loaded.', { expectedRevision: body.expectedRevision })
  await audit(env, workspaceId, access.user.id, 'review.upserted', 'submission', body.submissionId, { assignmentId: assignment.id, status, revision: updated.revision }, requestId)
  return json({ data: { revision: updated.revision, review, assignment: nextState.evaluationAssignments.find((item) => item.id === assignment.id) } }, 200, request, env, requestId, { ETag: `"${updated.revision}"` })
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

  let match = url.pathname.match(/^\/api\/public\/cfp\/([^/]+)\/([^/]+)$/)
  if (match) return publicCfp(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]))
  match = url.pathname.match(/^\/api\/public\/events\/([^/]+)\/([^/]+)\/state$/)
  if (match) return publicEventState(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]))
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/session$/)
  if (match) return workspaceSession(request, env, requestId, decodeURIComponent(match[1]))
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/events\/([^/]+)\/state$/)
  if (match) return eventState(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]))
  match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/events\/([^/]+)\/reviewer-queue$/)
  if (match) return reviewerQueue(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]))
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

const worker = { fetch: fetchHandler }
export default worker
export { SCHEMA_STATEMENTS, fetchHandler }
