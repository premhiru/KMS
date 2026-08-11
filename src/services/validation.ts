import { validateAppState } from '../core/storage'
import type { AppState, SubmissionStatus } from '../domain'
import type {
  AuditEntry,
  HealthStatus,
  IntegrationRun,
  IntegrationRunStatus,
  IntegrationStatus,
  MemberMutationReceipt,
  AcceleventsSyncReceipt,
  PublicCfpMetadata,
  PublicCfpSubmissionReceipt,
  PublicEventState,
  PublicSubmissionRecord,
  ReviewerMutationReceipt,
  ReviewerQueue,
  SubmissionStatusReceipt,
  SendEmailReceipt,
  UploadedAsset,
  VersionedAppState,
  VersionedSpeakerPortal,
  WorkspaceSession,
  WorkspaceMember,
  WorkspaceRole,
} from './contracts'

export class ResponseValidationError extends Error {
  readonly issues: string[]
  constructor(issues: string[]) {
    super(`API response failed validation: ${issues.join(' ')}`)
    this.name = 'ResponseValidationError'
    this.issues = issues
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function unwrapData(value: unknown): unknown {
  if (!isRecord(value) || !('data' in value)) throw new ResponseValidationError(['response must use the { data: ... } envelope.'])
  return value.data
}

function stringField(record: Record<string, unknown>, field: string, issues: string[], allowEmpty = false): string {
  const value = record[field]
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    issues.push(`${field} must be ${allowEmpty ? 'a string' : 'a non-empty string'}.`)
    return ''
  }
  return value
}

function numberField(record: Record<string, unknown>, field: string, issues: string[]): number {
  const value = record[field]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    issues.push(`${field} must be a non-negative integer.`)
    return 0
  }
  return value
}

function finish<T>(issues: string[], value: T): T {
  if (issues.length) throw new ResponseValidationError(issues)
  return value
}

export function parseAppState(value: unknown): AppState {
  const result = validateAppState(value)
  if (!result.ok) throw new ResponseValidationError(result.errors)
  return result.value
}

/** Public sanitization intentionally blanks speaker emails, so it cannot use the private-state validator. */
export function parsePublicAppState(value: unknown): AppState {
  const issues: string[] = []
  if (!isRecord(value)) throw new ResponseValidationError(['state must be an object.'])
  for (const collection of ['speakers', 'submissions', 'sessions', 'reviews', 'tasks', 'templates', 'communicationLog']) {
    if (!Array.isArray(value[collection])) issues.push(`state.${collection} must be an array.`)
  }
  if (!isRecord(value.event)) issues.push('state.event must be an object.')
  if (value.schemaVersion !== 1) issues.push('state.schemaVersion must be 1.')
  stringField(value, 'lastUpdatedAt', issues)
  if (Array.isArray(value.speakers)) value.speakers.forEach((speaker, index) => {
    if (!isRecord(speaker)) issues.push(`state.speakers[${index}] must be an object.`)
    else {
      for (const field of ['id', 'firstName', 'lastName', 'company', 'jobTitle', 'bio', 'status', 'createdAt', 'updatedAt']) stringField(speaker, field, issues, field === 'company' || field === 'jobTitle' || field === 'bio')
      stringField(speaker, 'email', issues, true)
    }
  })
  return finish(issues, value as unknown as AppState)
}

function eventSummary(value: unknown, issues: string[]) {
  if (!isRecord(value)) {
    issues.push('event must be an object.')
    return { id: '', name: '', slug: '' }
  }
  return { id: stringField(value, 'id', issues), name: stringField(value, 'name', issues), slug: stringField(value, 'slug', issues) }
}

export function parseVersionedState(value: unknown, etag?: string | null): VersionedAppState {
  const data = unwrapData(value)
  const issues: string[] = []
  if (!isRecord(data)) throw new ResponseValidationError(['state data must be an object.'])
  const revision = numberField(data, 'revision', issues)
  const etagRevision = etag?.replace(/^W\//, '').replace(/^"|"$/g, '')
  if (etagRevision !== undefined && etagRevision !== String(revision)) issues.push('ETag and body revision must match.')
  const rawEvent = data.event
  const summary = eventSummary(rawEvent, issues)
  if (!isRecord(rawEvent)) throw new ResponseValidationError(issues)
  if (typeof rawEvent.cfpOpen !== 'boolean') issues.push('event.cfpOpen must be a boolean.')
  if (!isRecord(rawEvent.cfpConfig)) issues.push('event.cfpConfig must be an object.')
  return finish(issues, {
    event: { ...summary, cfpOpen: rawEvent.cfpOpen === true, cfpConfig: isRecord(rawEvent.cfpConfig) ? rawEvent.cfpConfig : {} },
    revision,
    state: parseAppState(data.state),
    updatedAt: stringField(data, 'updatedAt', issues),
  })
}

export function parsePublicEvent(value: unknown, etag?: string | null): PublicEventState {
  const data = unwrapData(value)
  const issues: string[] = []
  if (!isRecord(data)) throw new ResponseValidationError(['public event data must be an object.'])
  const revision = numberField(data, 'revision', issues)
  const etagRevision = etag?.replace(/^W\//, '').replace(/^"|"$/g, '')
  if (etagRevision !== undefined && etagRevision !== String(revision)) issues.push('ETag and body revision must match.')
  return finish(issues, {
    event: eventSummary(data.event, issues), revision, state: parsePublicAppState(data.state), updatedAt: stringField(data, 'updatedAt', issues),
  })
}

export function parsePublicCfp(value: unknown): PublicCfpMetadata {
  const data = unwrapData(value)
  const issues: string[] = []
  if (!isRecord(data)) throw new ResponseValidationError(['public CFP data must be an object.'])
  if (!isRecord(data.config)) issues.push('config must be an object.')
  if (data.state !== null && !isRecord(data.state)) issues.push('state must be an object or null.')
  return finish(issues, {
    event: eventSummary(data.event, issues),
    config: isRecord(data.config) ? data.config : {},
    revision: numberField(data, 'revision', issues),
    state: data.state === null ? null : parsePublicAppState(data.state),
  })
}

export function parseCfpReceipt(value: unknown): PublicCfpSubmissionReceipt {
  const data = unwrapData(value)
  const issues: string[] = []
  if (!isRecord(data)) throw new ResponseValidationError(['CFP receipt data must be an object.'])
  if (data.status !== 'needs-review') issues.push('status must be needs-review.')
  return finish(issues, { id: stringField(data, 'id', issues), status: 'needs-review', submittedAt: stringField(data, 'submittedAt', issues) })
}

export function parseUploadedAsset(value: unknown): UploadedAsset {
  const data = unwrapData(value)
  const issues: string[] = []
  if (!isRecord(data)) throw new ResponseValidationError(['asset data must be an object.'])
  return finish(issues, {
    id: stringField(data, 'id', issues), fileName: stringField(data, 'fileName', issues), contentType: stringField(data, 'contentType', issues),
    sizeBytes: numberField(data, 'sizeBytes', issues), createdAt: stringField(data, 'createdAt', issues),
  })
}

const roles: WorkspaceRole[] = ['owner', 'organizer', 'reviewer', 'speaker']
function role(value: unknown, issues: string[]): WorkspaceRole {
  if (!roles.includes(value as WorkspaceRole)) issues.push('role is invalid.')
  return value as WorkspaceRole
}

export function parseMembers(value: unknown): WorkspaceMember[] {
  const data = unwrapData(value)
  if (!Array.isArray(data)) throw new ResponseValidationError(['members data must be an array.'])
  const issues: string[] = []
  const members = data.map((item, index) => {
    if (!isRecord(item)) {
      issues.push(`members[${index}] must be an object.`)
      return { id: '', email: '', name: '', role: 'speaker', createdAt: '' } as WorkspaceMember
    }
    return { id: stringField(item, 'id', issues), email: stringField(item, 'email', issues), name: stringField(item, 'name', issues, true), role: role(item.role, issues), createdAt: stringField(item, 'created_at', issues) }
  })
  return finish(issues, members)
}

export function parseMemberReceipt(value: unknown): MemberMutationReceipt {
  const data = unwrapData(value)
  const issues: string[] = []
  if (!isRecord(data)) throw new ResponseValidationError(['member receipt data must be an object.'])
  return finish(issues, { userId: stringField(data, 'userId', issues), role: role(data.role, issues) })
}

export function parseAudit(value: unknown): AuditEntry[] {
  const data = unwrapData(value)
  if (!Array.isArray(data)) throw new ResponseValidationError(['audit data must be an array.'])
  const issues: string[] = []
  const entries = data.map((item, index) => {
    if (!isRecord(item)) {
      issues.push(`audit[${index}] must be an object.`)
      return { id: '', actorUserId: null, action: '', entityType: '', entityId: '', metadata: {}, requestId: '', createdAt: '' }
    }
    if (item.actor_user_id !== null && typeof item.actor_user_id !== 'string') issues.push(`audit[${index}].actor_user_id must be a string or null.`)
    if (!isRecord(item.metadata)) issues.push(`audit[${index}].metadata must be an object.`)
    return {
      id: stringField(item, 'id', issues), actorUserId: typeof item.actor_user_id === 'string' ? item.actor_user_id : null,
      action: stringField(item, 'action', issues), entityType: stringField(item, 'entity_type', issues), entityId: stringField(item, 'entity_id', issues),
      metadata: isRecord(item.metadata) ? item.metadata : {}, requestId: stringField(item, 'request_id', issues), createdAt: stringField(item, 'created_at', issues),
    }
  })
  return finish(issues, entries)
}

const statuses: SubmissionStatus[] = ['needs-review', 'in-review', 'accepted', 'waitlisted', 'declined']
export function parseSubmissions(value: unknown): PublicSubmissionRecord[] {
  const data = unwrapData(value)
  if (!Array.isArray(data)) throw new ResponseValidationError(['submissions data must be an array.'])
  const issues: string[] = []
  const rows = data.map((item, index) => {
    if (!isRecord(item)) {
      issues.push(`submissions[${index}] must be an object.`)
      return {} as PublicSubmissionRecord
    }
    if (!statuses.includes(item.status as SubmissionStatus)) issues.push(`submissions[${index}].status is invalid.`)
    return {
      id: stringField(item, 'id', issues), title: stringField(item, 'title', issues), abstract: stringField(item, 'abstract', issues),
      speakerName: stringField(item, 'speaker_name', issues), speakerEmail: stringField(item, 'speaker_email', issues), track: stringField(item, 'track', issues, true),
      format: stringField(item, 'format', issues, true), status: item.status as SubmissionStatus, createdAt: stringField(item, 'created_at', issues), updatedAt: stringField(item, 'updated_at', issues),
    }
  })
  return finish(issues, rows)
}

export function parseSubmissionReceipt(value: unknown): SubmissionStatusReceipt {
  const data = unwrapData(value)
  const issues: string[] = []
  if (!isRecord(data)) throw new ResponseValidationError(['submission receipt data must be an object.'])
  if (!statuses.includes(data.status as SubmissionStatus)) issues.push('status is invalid.')
  return finish(issues, { id: stringField(data, 'id', issues), status: data.status as SubmissionStatus, updatedAt: stringField(data, 'updatedAt', issues) })
}

export function parseHealth(value: unknown): HealthStatus {
  const data = unwrapData(value)
  const issues: string[] = []
  if (!isRecord(data)) throw new ResponseValidationError(['health data must be an object.'])
  if (data.status !== 'ok') issues.push('status must be ok.')
  if (data.database !== 'ok') issues.push('database must be ok.')
  if (typeof data.files !== 'boolean') issues.push('files must be a boolean.')
  return finish(issues, { status: 'ok', database: 'ok', files: data.files === true, timestamp: stringField(data, 'timestamp', issues) })
}

function optionalString(record: Record<string, unknown>, field: string, issues: string[]): string | undefined {
  const value = record[field]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    issues.push(`${field} must be a string when present.`)
    return undefined
  }
  return value
}

const runStatuses: IntegrationRunStatus[] = ['running', 'sent', 'succeeded', 'partial', 'failed']

export function parseIntegrationStatus(value: unknown): IntegrationStatus {
  const data = unwrapData(value)
  const issues: string[] = []
  if (!isRecord(data)) throw new ResponseValidationError(['integration data must be an object.'])
  if (!isRecord(data.configured) || typeof data.configured.resend !== 'boolean' || typeof data.configured.accelevents !== 'boolean') issues.push('configured must contain boolean resend and accelevents fields.')
  if (!Array.isArray(data.runs)) issues.push('runs must be an array.')
  if (!Array.isArray(data.deliveries)) issues.push('deliveries must be an array.')
  const runs: IntegrationRun[] = Array.isArray(data.runs) ? data.runs.map((item, index) => {
    if (!isRecord(item)) {
      issues.push(`runs[${index}] must be an object.`)
      return {} as IntegrationRun
    }
    if (!['resend', 'accelevents'].includes(String(item.provider))) issues.push(`runs[${index}].provider is invalid.`)
    if (!runStatuses.includes(item.status as IntegrationRunStatus)) issues.push(`runs[${index}].status is invalid.`)
    if (!isRecord(item.response)) issues.push(`runs[${index}].response must be an object.`)
    return {
      id: stringField(item, 'id', issues), provider: item.provider as IntegrationRun['provider'], action: stringField(item, 'action', issues) as IntegrationRun['action'],
      idempotencyKey: stringField(item, 'idempotency_key', issues), status: item.status as IntegrationRunStatus,
      response: isRecord(item.response) ? item.response : {}, errorCode: optionalString(item, 'error_code', issues), errorMessage: optionalString(item, 'error_message', issues),
      startedBy: stringField(item, 'started_by', issues), createdAt: stringField(item, 'created_at', issues), completedAt: optionalString(item, 'completed_at', issues),
    }
  }) : []
  const deliveries = Array.isArray(data.deliveries) ? data.deliveries.map((item, index) => {
    if (!isRecord(item)) {
      issues.push(`deliveries[${index}] must be an object.`)
      return {} as IntegrationStatus['deliveries'][number]
    }
    if (!['queued', 'sent', 'failed'].includes(String(item.status))) issues.push(`deliveries[${index}].status is invalid.`)
    return {
      id: stringField(item, 'id', issues), runId: stringField(item, 'run_id', issues), idempotencyKey: stringField(item, 'idempotency_key', issues),
      recipientSpeakerId: stringField(item, 'recipient_speaker_id', issues), recipientEmail: stringField(item, 'recipient_email', issues), subject: stringField(item, 'subject', issues),
      providerMessageId: optionalString(item, 'provider_message_id', issues), status: item.status as 'queued' | 'sent' | 'failed', errorMessage: optionalString(item, 'error_message', issues),
      createdAt: stringField(item, 'created_at', issues), updatedAt: stringField(item, 'updated_at', issues),
    }
  }) : []
  return finish(issues, { configured: { resend: isRecord(data.configured) && data.configured.resend === true, accelevents: isRecord(data.configured) && data.configured.accelevents === true }, runs, deliveries })
}

export function parseSendEmailReceipt(value: unknown): SendEmailReceipt {
  const data = unwrapData(value)
  const issues: string[] = []
  if (!isRecord(data)) throw new ResponseValidationError(['email receipt data must be an object.'])
  if (!runStatuses.includes(data.status as IntegrationRunStatus)) issues.push('status is invalid.')
  if (typeof data.replayed !== 'boolean') issues.push('replayed must be a boolean.')
  if (!isRecord(data.result)) issues.push('result must be an object.')
  return finish(issues, {
    runId: stringField(data, 'runId', issues), status: data.status as IntegrationRunStatus, replayed: data.replayed === true,
    result: isRecord(data.result) ? data.result : {}, errorCode: optionalString(data, 'errorCode', issues), errorMessage: optionalString(data, 'errorMessage', issues),
  })
}

export function parseAcceleventsReceipt(value: unknown): AcceleventsSyncReceipt {
  const data = unwrapData(value)
  const issues: string[] = []
  if (!isRecord(data)) throw new ResponseValidationError(['Accelevents receipt data must be an object.'])
  if (!runStatuses.includes(data.status as IntegrationRunStatus)) issues.push('status is invalid.')
  if (typeof data.replayed !== 'boolean') issues.push('replayed must be a boolean.')
  if (!isRecord(data.result)) issues.push('result must be an object.')
  let synced: AcceleventsSyncReceipt['synced']
  if (data.synced !== undefined) {
    if (!isRecord(data.synced) || typeof data.synced.sessions !== 'number' || typeof data.synced.speakers !== 'number') issues.push('synced must contain numeric sessions and speakers.')
    else synced = { sessions: data.synced.sessions, speakers: data.synced.speakers }
  }
  return finish(issues, { runId: stringField(data, 'runId', issues), status: data.status as IntegrationRunStatus, replayed: data.replayed === true, result: isRecord(data.result) ? data.result : {}, synced })
}

export function parseSpeakerPortal(value: unknown, etag?: string | null): VersionedSpeakerPortal {
  const data = unwrapData(value)
  const issues: string[] = []
  if (!isRecord(data)) throw new ResponseValidationError(['speaker portal data must be an object.'])
  const revision = numberField(data, 'revision', issues)
  const etagRevision = etag?.replace(/^W\//, '').replace(/^"|"$/g, '')
  if (etagRevision !== undefined && etagRevision !== String(revision)) issues.push('ETag and body revision must match.')
  if (!isRecord(data.portal)) throw new ResponseValidationError(['portal must be an object.'])
  const portal = data.portal
  if (!isRecord(portal.event)) issues.push('portal.event must be an object.')
  if (!isRecord(portal.speaker)) issues.push('portal.speaker must be an object.')
  for (const collection of ['submissions', 'tasks', 'sessions', 'resources', 'assets']) if (!Array.isArray(portal[collection])) issues.push(`portal.${collection} must be an array.`)
  if (isRecord(portal.speaker)) for (const field of ['id', 'firstName', 'lastName', 'email', 'createdAt', 'updatedAt']) stringField(portal.speaker, field, issues)
  const resources = Array.isArray(portal.resources) ? portal.resources.map((item, index) => {
    if (!isRecord(item)) {
      issues.push(`portal.resources[${index}] must be an object.`)
      return { id: '', title: '', body: '' }
    }
    return {
      id: stringField(item, 'id', issues), title: stringField(item, 'title', issues), body: stringField(item, 'body', issues, true),
      embedUrl: optionalString(item, 'embedUrl', issues), description: optionalString(item, 'description', issues), url: optionalString(item, 'url', issues), type: optionalString(item, 'type', issues),
    }
  }) : []
  const assets = Array.isArray(portal.assets) ? portal.assets.map((item, index) => {
    if (!isRecord(item)) {
      issues.push(`portal.assets[${index}] must be an object.`)
      return { id: '', fileName: '', contentType: '', sizeBytes: 0, createdAt: '', downloadUrl: '' }
    }
    return {
      id: stringField(item, 'id', issues), fileName: stringField(item, 'file_name', issues), contentType: stringField(item, 'content_type', issues),
      sizeBytes: numberField(item, 'size_bytes', issues), createdAt: stringField(item, 'created_at', issues), downloadUrl: stringField(item, 'downloadUrl', issues),
    }
  }) : []
  return finish(issues, {
    revision,
    portal: {
      event: portal.event as VersionedSpeakerPortal['portal']['event'], speaker: portal.speaker as VersionedSpeakerPortal['portal']['speaker'],
      submissions: portal.submissions as VersionedSpeakerPortal['portal']['submissions'], tasks: portal.tasks as VersionedSpeakerPortal['portal']['tasks'],
      sessions: portal.sessions as VersionedSpeakerPortal['portal']['sessions'], resources, assets,
    },
  })
}

export function parseWorkspaceSession(value: unknown): WorkspaceSession {
  const data = unwrapData(value)
  const issues: string[] = []
  if (!isRecord(data)) throw new ResponseValidationError(['session data must be an object.'])
  if (!isRecord(data.user)) issues.push('user must be an object.')
  const user = isRecord(data.user) ? {
    id: stringField(data.user, 'id', issues), email: stringField(data.user, 'email', issues), name: stringField(data.user, 'name', issues, true),
  } : { id: '', email: '', name: '' }
  return finish(issues, { user, role: role(data.role, issues) })
}

export function parseReviewerQueue(value: unknown, etag?: string | null): ReviewerQueue {
  const data = unwrapData(value)
  const issues: string[] = []
  if (!isRecord(data)) throw new ResponseValidationError(['reviewer queue data must be an object.'])
  const revision = numberField(data, 'revision', issues)
  const etagRevision = etag?.replace(/^W\//, '').replace(/^"|"$/g, '')
  if (etagRevision !== undefined && etagRevision !== String(revision)) issues.push('ETag and body revision must match.')
  if (!isRecord(data.event)) issues.push('event must be an object.')
  for (const collection of ['assignments', 'rounds', 'plans', 'submissions', 'speakers', 'reviews']) if (!Array.isArray(data[collection])) issues.push(`${collection} must be an array.`)
  if (isRecord(data.event)) {
    for (const field of ['id', 'name', 'slug', 'venue', 'timezone', 'startAt', 'endAt']) stringField(data.event, field, issues)
    if (!Array.isArray(data.event.rooms) || !data.event.rooms.every((room) => typeof room === 'string')) issues.push('event.rooms must be a string array.')
    if (!Array.isArray(data.event.tracks) || !data.event.tracks.every((track) => typeof track === 'string')) issues.push('event.tracks must be a string array.')
  }
  if (Array.isArray(data.rounds)) data.rounds.forEach((round, index) => {
    if (!isRecord(round)) issues.push(`rounds[${index}] must be an object.`)
    else {
      for (const field of ['id', 'planId', 'name', 'instructions', 'status', 'dueAt']) stringField(round, field, issues, field === 'instructions')
      if (!Array.isArray(round.rubric)) issues.push(`rounds[${index}].rubric must be an array.`)
      if (typeof round.blind !== 'boolean') issues.push(`rounds[${index}].blind must be a boolean.`)
    }
  })
  if (Array.isArray(data.plans)) data.plans.forEach((plan, index) => {
    if (!isRecord(plan)) issues.push(`plans[${index}] must be an object.`)
    else {
      stringField(plan, 'id', issues)
      if (plan.name === undefined && plan.label === undefined) issues.push(`plans[${index}] must include name or label.`)
      optionalString(plan, 'name', issues)
      optionalString(plan, 'label', issues)
    }
  })
  return finish(issues, {
    revision, event: data.event as ReviewerQueue['event'], assignments: data.assignments as ReviewerQueue['assignments'],
    rounds: data.rounds as ReviewerQueue['rounds'], plans: data.plans as ReviewerQueue['plans'], submissions: data.submissions as ReviewerQueue['submissions'],
    speakers: data.speakers as ReviewerQueue['speakers'], reviews: data.reviews as ReviewerQueue['reviews'],
  })
}

export function parseReviewerMutation(value: unknown, etag?: string | null): ReviewerMutationReceipt {
  const data = unwrapData(value)
  const issues: string[] = []
  if (!isRecord(data)) throw new ResponseValidationError(['review mutation data must be an object.'])
  const revision = numberField(data, 'revision', issues)
  const etagRevision = etag?.replace(/^W\//, '').replace(/^"|"$/g, '')
  if (etagRevision !== undefined && etagRevision !== String(revision)) issues.push('ETag and body revision must match.')
  if (!isRecord(data.review)) issues.push('review must be an object.')
  if (!isRecord(data.assignment)) issues.push('assignment must be an object.')
  if (isRecord(data.review)) for (const field of ['id', 'submissionId', 'reviewerName', 'updatedAt']) stringField(data.review, field, issues)
  if (isRecord(data.assignment)) for (const field of ['id', 'submissionId', 'reviewerEmail', 'status', 'updatedAt']) stringField(data.assignment, field, issues)
  return finish(issues, { revision, review: data.review as ReviewerMutationReceipt['review'], assignment: data.assignment as ReviewerMutationReceipt['assignment'] })
}
