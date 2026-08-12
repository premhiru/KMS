import type { AppState, SubmissionStatus } from '../domain'
import { ApiError } from './api-error'
import { ApiTransport, type ApiTransportOptions } from './api-transport'
import type {
  ApiClientScope,
  AppStateDataSource,
  AcceleventsSyncReceipt,
  AuditEntry,
  DownloadedAsset,
  HealthStatus,
  IntegrationLogs,
  IntegrationStatus,
  MemberInput,
  MemberMutationReceipt,
  PublicCfpMetadata,
  PublicCfpClaimReceipt,
  PublicCfpClaimRequestInput,
  PublicCfpClaimRequestReceipt,
  PublicCfpSubmissionInput,
  PublicCfpSubmissionReceipt,
  PublicEventState,
  PublicSubmissionRecord,
  ReviewerMutationInput,
  ReviewerMutationReceipt,
  ReviewerQueue,
  ReminderAutomationStatus,
  RequestOptions,
  RunRemindersInput,
  RunRemindersReceipt,
  SendEmailInput,
  SendEmailReceipt,
  SessionProbe,
  StateWriteOptions,
  StateHistory,
  StateRevisionDetail,
  StateRollbackInput,
  StateRollbackReceipt,
  SubmissionStatusReceipt,
  UploadedAsset,
  VersionedAppState,
  VersionedSpeakerPortal,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceSession,
  SpeakerPortalPatch,
  CreateWorkspaceEventInput,
  CreateWorkspaceEventReceipt,
  SpeakerProposalMutationInput,
  SpeakerProposalMutationReceipt,
  WorkspaceEventList,
} from './contracts'
import {
  isRecord,
  parseAudit,
  parseAcceleventsReceipt,
  parseCfpReceipt,
  parseCfpClaimReceipt,
  parseCfpClaimRequestReceipt,
  parseHealth,
  parseIntegrationStatus,
  parseMemberReceipt,
  parseMembers,
  parsePublicCfp,
  parsePublicEvent,
  parseReviewerMutation,
  parseReviewerQueue,
  parseReminderAutomationStatus,
  parseRunRemindersReceipt,
  parseSubmissionReceipt,
  parseSendEmailReceipt,
  parseSpeakerPortal,
  parseSubmissions,
  parseUploadedAsset,
  parseVersionedState,
  parseStateHistory,
  parseStateRevisionDetail,
  parseStateRollbackReceipt,
  parseWorkspaceSession,
  ResponseValidationError,
  unwrapData,
} from './validation'

export interface OpenSpeakerApiClientOptions extends ApiTransportOptions, ApiClientScope {}

function segment(value: string): string {
  return encodeURIComponent(value)
}

function fileNameFromDisposition(value: string | null): string {
  if (!value) return 'download'
  const utf8 = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (utf8) {
    try { return decodeURIComponent(utf8) } catch { return utf8 }
  }
  return value.match(/filename="([^"]+)"/i)?.[1] ?? value.match(/filename=([^;]+)/i)?.[1]?.trim() ?? 'download'
}

function writeReceipt(value: unknown, response: Response, state: AppState): VersionedAppState {
  const data = unwrapData(value)
  const issues: string[] = []
  if (!isRecord(data)) throw new ResponseValidationError(['state write data must be an object.'])
  const revision = data.revision
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) issues.push('revision must be a positive integer.')
  if (typeof data.eventId !== 'string' || !data.eventId) issues.push('eventId must be a non-empty string.')
  if (typeof data.updatedAt !== 'string' || !data.updatedAt) issues.push('updatedAt must be a non-empty string.')
  const etag = response.headers.get('etag')?.replace(/^W\//, '').replace(/^"|"$/g, '')
  if (etag !== undefined && etag !== String(revision)) issues.push('ETag and body revision must match.')
  if (issues.length) throw new ResponseValidationError(issues)
  return {
    event: { id: data.eventId as string, name: state.event.name, slug: state.event.slug, cfpOpen: state.event.cfp?.open ?? false, cfpConfig: (state.event.cfp ?? {}) as unknown as Record<string, unknown> },
    state, revision: revision as number, updatedAt: data.updatedAt as string,
  }
}

export class OpenSpeakerApiClient implements AppStateDataSource {
  private readonly transport: ApiTransport
  readonly workspaceId: string
  readonly eventId: string
  readonly eventSlug: string

  constructor(options: OpenSpeakerApiClientOptions) {
    const { workspaceId, eventId, eventSlug, ...transportOptions } = options
    if (!workspaceId || !eventId || !eventSlug) throw new Error('workspaceId, eventId, and eventSlug are required.')
    this.workspaceId = workspaceId
    this.eventId = eventId
    this.eventSlug = eventSlug
    this.transport = new ApiTransport(transportOptions)
  }

  private workspacePath(suffix: string): string {
    return `api/workspaces/${segment(this.workspaceId)}/${suffix}`
  }

  private eventPath(suffix: string): string {
    return this.workspacePath(`events/${segment(this.eventId)}/${suffix}`)
  }

  getState(options: RequestOptions = {}): Promise<VersionedAppState> {
    return this.transport.request({
      path: this.eventPath('state'), signal: options.signal, timeoutMs: options.timeoutMs,
      parse: (value, response) => parseVersionedState(value, response.headers.get('etag')),
    })
  }

  putState(state: AppState, options: StateWriteOptions): Promise<VersionedAppState> {
    if (!Number.isSafeInteger(options.revision) || options.revision < 0) return Promise.reject(new ApiError('A non-negative expected revision is required.', {
      code: 'REVISION_REQUIRED', requestId: 'client-validation', method: 'PUT', url: this.eventPath('state'),
    }))
    return this.transport.request({
      path: this.eventPath('state'), method: 'PUT',
      headers: { 'if-match': `"${options.revision}"` },
      body: {
        expectedRevision: options.revision,
        event: { name: state.event.name, slug: state.event.slug, cfpOpen: state.event.cfp?.open ?? false, cfpConfig: { ...(state.event.cfp ?? {}), tracks: state.event.tracks, formats: ['Talk', 'Workshop', 'Panel', 'Lightning talk'] } },
        state,
      },
      signal: options.signal, timeoutMs: options.timeoutMs,
      parse: (value, response) => writeReceipt(value, response, state),
    })
  }

  getStateHistory(options: RequestOptions = {}): Promise<StateHistory> {
    return this.transport.request({ path: this.eventPath('state/history'), signal: options.signal, timeoutMs: options.timeoutMs, parse: parseStateHistory })
  }

  getStateRevision(revision: number, options: RequestOptions = {}): Promise<StateRevisionDetail> {
    if (!Number.isSafeInteger(revision) || revision < 1) return Promise.reject(new ApiError('A positive state revision is required.', {
      code: 'INVALID_REVISION', requestId: 'client-validation', method: 'GET', url: this.eventPath(`state/history/${revision}`),
    }))
    return this.transport.request({
      path: this.eventPath(`state/history/${revision}`), signal: options.signal, timeoutMs: options.timeoutMs,
      parse: (value, response) => parseStateRevisionDetail(value, response.headers.get('etag')),
    })
  }

  rollbackState(input: StateRollbackInput, options: RequestOptions = {}): Promise<StateRollbackReceipt> {
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1 || !Number.isSafeInteger(input.targetRevision) || input.targetRevision < 1) return Promise.reject(new ApiError('Positive expected and target revisions are required.', {
      code: 'INVALID_REVISION', requestId: 'client-validation', method: 'POST', url: this.eventPath('state/rollback'),
    }))
    return this.transport.request({
      path: this.eventPath('state/rollback'), method: 'POST', body: input, signal: options.signal, timeoutMs: options.timeoutMs,
      parse: (value, response) => parseStateRollbackReceipt(value, response.headers.get('etag')),
    })
  }

  getPublicEvent(options: RequestOptions = {}): Promise<PublicEventState> {
    return this.transport.request({
      path: `api/public/events/${segment(this.workspaceId)}/${segment(this.eventSlug)}/state`, signal: options.signal, timeoutMs: options.timeoutMs,
      parse: (value, response) => parsePublicEvent(value, response.headers.get('etag')),
    })
  }

  getPublicCfp(options: RequestOptions = {}): Promise<PublicCfpMetadata> {
    return this.transport.request({
      path: `api/public/cfp/${segment(this.workspaceId)}/${segment(this.eventSlug)}`, signal: options.signal, timeoutMs: options.timeoutMs, parse: parsePublicCfp,
    })
  }

  submitCfp(input: PublicCfpSubmissionInput, options: RequestOptions = {}): Promise<PublicCfpSubmissionReceipt> {
    return this.transport.request({
      path: `api/public/cfp/${segment(this.workspaceId)}/${segment(this.eventSlug)}`, method: 'POST', body: input,
      signal: options.signal, timeoutMs: options.timeoutMs, parse: parseCfpReceipt,
    })
  }

  requestCfpClaim(input: PublicCfpClaimRequestInput, options: RequestOptions = {}): Promise<PublicCfpClaimRequestReceipt> {
    return this.transport.request({
      path: `api/public/cfp/${segment(this.workspaceId)}/${segment(this.eventSlug)}/claim`, method: 'POST', body: input,
      signal: options.signal, timeoutMs: options.timeoutMs, parse: parseCfpClaimRequestReceipt,
    })
  }

  verifyCfpClaim(token: string, options: RequestOptions = {}): Promise<PublicCfpClaimReceipt> {
    if (!token.trim()) return Promise.reject(new ApiError('A claim token is required.', {
      code: 'CLAIM_TOKEN_REQUIRED', requestId: 'client-validation', method: 'GET', url: `api/public/cfp/${segment(this.workspaceId)}/${segment(this.eventSlug)}/claim`,
    }))
    return this.transport.request({
      path: `api/public/cfp/${segment(this.workspaceId)}/${segment(this.eventSlug)}/claim?token=${encodeURIComponent(token)}`,
      signal: options.signal, timeoutMs: options.timeoutMs, parse: parseCfpClaimReceipt,
    })
  }

  uploadAsset(file: File, options: RequestOptions = {}): Promise<UploadedAsset> {
    return this.transport.request({
      path: this.eventPath('assets'), method: 'POST', rawBody: file,
      headers: { 'content-type': file.type || 'application/octet-stream', 'x-file-name': file.name },
      signal: options.signal, timeoutMs: options.timeoutMs, parse: parseUploadedAsset,
    })
  }

  downloadAsset(assetId: string, options: RequestOptions = {}): Promise<DownloadedAsset> {
    return this.transport.request({
      path: this.eventPath(`assets/${segment(assetId)}`), responseType: 'blob', signal: options.signal, timeoutMs: options.timeoutMs,
      parse: (value, response) => {
        if (!(value instanceof Blob)) throw new ResponseValidationError(['asset response must contain bytes.'])
        const declaredSize = Number(response.headers.get('content-length') ?? value.size)
        return {
          blob: value, fileName: fileNameFromDisposition(response.headers.get('content-disposition')),
          contentType: response.headers.get('content-type') ?? value.type, sizeBytes: Number.isFinite(declaredSize) ? declaredSize : value.size,
          etag: response.headers.get('etag') ?? undefined,
        }
      },
    })
  }

  async deleteAsset(assetId: string, options: RequestOptions = {}): Promise<void> {
    await this.transport.request({
      path: this.eventPath(`assets/${segment(assetId)}`), method: 'DELETE', signal: options.signal, timeoutMs: options.timeoutMs,
      parse: (value) => { if (value !== undefined) throw new ResponseValidationError(['asset delete response must be empty.']) },
    })
  }

  getMembers(options: RequestOptions = {}): Promise<WorkspaceMember[]> {
    return this.transport.request({ path: this.workspacePath('members'), signal: options.signal, timeoutMs: options.timeoutMs, parse: parseMembers })
  }

  addMember(input: MemberInput, options: RequestOptions = {}): Promise<MemberMutationReceipt> {
    return this.transport.request({ path: this.workspacePath('members'), method: 'POST', body: input, signal: options.signal, timeoutMs: options.timeoutMs, parse: parseMemberReceipt })
  }

  updateMemberRole(userId: string, role: WorkspaceRole, options: RequestOptions = {}): Promise<MemberMutationReceipt> {
    return this.transport.request({ path: this.workspacePath(`members/${segment(userId)}`), method: 'PATCH', body: { role }, signal: options.signal, timeoutMs: options.timeoutMs, parse: parseMemberReceipt })
  }

  async removeMember(userId: string, options: RequestOptions = {}): Promise<void> {
    await this.transport.request({
      path: this.workspacePath(`members/${segment(userId)}`), method: 'DELETE', signal: options.signal, timeoutMs: options.timeoutMs,
      parse: (value) => { if (value !== undefined) throw new ResponseValidationError(['member delete response must be empty.']) },
    })
  }

  getAudit(options: RequestOptions = {}): Promise<AuditEntry[]> {
    return this.transport.request({ path: this.workspacePath('audit'), signal: options.signal, timeoutMs: options.timeoutMs, parse: parseAudit })
  }

  getSubmissions(options: RequestOptions = {}): Promise<PublicSubmissionRecord[]> {
    return this.transport.request({ path: this.eventPath('submissions'), signal: options.signal, timeoutMs: options.timeoutMs, parse: parseSubmissions })
  }

  updateSubmissionStatus(submissionId: string, status: SubmissionStatus, options: RequestOptions = {}): Promise<SubmissionStatusReceipt> {
    return this.transport.request({
      path: this.eventPath(`submissions/${segment(submissionId)}`), method: 'PATCH', body: { status }, signal: options.signal, timeoutMs: options.timeoutMs, parse: parseSubmissionReceipt,
    })
  }

  getHealth(options: RequestOptions = {}): Promise<HealthStatus> {
    return this.transport.request({ path: 'api/health', signal: options.signal, timeoutMs: options.timeoutMs, parse: parseHealth })
  }

  getIntegrationStatus(options: RequestOptions = {}): Promise<IntegrationStatus> {
    return this.transport.request({ path: this.eventPath('integrations'), signal: options.signal, timeoutMs: options.timeoutMs, parse: parseIntegrationStatus })
  }

  async getIntegrationLogs(options: RequestOptions = {}): Promise<IntegrationLogs> {
    const { runs, deliveries } = await this.getIntegrationStatus(options)
    return { runs, deliveries }
  }

  sendEmail(input: SendEmailInput, options: RequestOptions = {}): Promise<SendEmailReceipt> {
    return this.transport.request({
      path: this.eventPath('integrations/email/send'), method: 'POST', body: input,
      signal: options.signal, timeoutMs: options.timeoutMs, parse: parseSendEmailReceipt,
    })
  }

  syncAccelevents(idempotencyKey: string, options: RequestOptions = {}): Promise<AcceleventsSyncReceipt> {
    return this.transport.request({
      path: this.eventPath('integrations/accelevents/sync'), method: 'POST', body: { idempotencyKey },
      signal: options.signal, timeoutMs: options.timeoutMs, parse: parseAcceleventsReceipt,
    })
  }

  getReminderAutomation(options: RequestOptions = {}): Promise<ReminderAutomationStatus> {
    return this.transport.request({ path: this.eventPath('reminders'), signal: options.signal, timeoutMs: options.timeoutMs, parse: parseReminderAutomationStatus })
  }

  runReminders(input: RunRemindersInput = {}, options: RequestOptions = {}): Promise<RunRemindersReceipt> {
    return this.transport.request({
      path: this.eventPath('reminders/run'), method: 'POST', body: input,
      signal: options.signal, timeoutMs: options.timeoutMs, parse: parseRunRemindersReceipt,
    })
  }

  getSpeakerPortal(options: RequestOptions = {}): Promise<VersionedSpeakerPortal> {
    return this.transport.request({
      path: this.eventPath('speaker-portal'), signal: options.signal, timeoutMs: options.timeoutMs,
      parse: (value, response) => parseSpeakerPortal(value, response.headers.get('etag')),
    })
  }

  patchSpeakerPortal(patch: SpeakerPortalPatch, options: RequestOptions = {}): Promise<VersionedSpeakerPortal> {
    return this.transport.request({
      path: this.eventPath('speaker-portal'), method: 'PATCH', body: patch, headers: { 'if-match': `"${patch.expectedRevision}"` },
      signal: options.signal, timeoutMs: options.timeoutMs,
      parse: (value, response) => parseSpeakerPortal(value, response.headers.get('etag')),
    })
  }

  saveSpeakerProposal(input: SpeakerProposalMutationInput, submissionId?: string, options: RequestOptions = {}): Promise<SpeakerProposalMutationReceipt> {
    return this.transport.request({
      path: this.eventPath(`speaker-portal/submissions${submissionId ? `/${segment(submissionId)}` : ''}`), method: submissionId ? 'PATCH' : 'POST', body: input, headers: { 'if-match': `"${input.expectedRevision}"` },
      signal: options.signal, timeoutMs: options.timeoutMs,
      parse: (value) => {
        const data = unwrapData(value)
        if (!isRecord(data) || !Number.isSafeInteger(data.revision) || !isRecord(data.proposal)) throw new ResponseValidationError(['speaker proposal receipt is invalid.'])
        return { revision: data.revision as number, proposal: data.proposal as unknown as SpeakerProposalMutationReceipt['proposal'] }
      },
    })
  }

  getReviewerQueue(options: RequestOptions = {}): Promise<ReviewerQueue> {
    return this.transport.request({
      path: this.eventPath('reviewer-queue'), signal: options.signal, timeoutMs: options.timeoutMs,
      parse: (value, response) => parseReviewerQueue(value, response.headers.get('etag')),
    })
  }

  submitReview(input: ReviewerMutationInput, options: RequestOptions = {}): Promise<ReviewerMutationReceipt> {
    return this.transport.request({
      path: this.eventPath('reviews'), method: 'POST', body: input, headers: { 'if-match': `"${input.expectedRevision}"` },
      signal: options.signal, timeoutMs: options.timeoutMs,
      parse: (value, response) => parseReviewerMutation(value, response.headers.get('etag')),
    })
  }

  getSession(options: RequestOptions = {}): Promise<WorkspaceSession> {
    return this.transport.request({ path: this.workspacePath('session'), signal: options.signal, timeoutMs: options.timeoutMs, parse: parseWorkspaceSession })
  }

  listEvents(options: RequestOptions = {}): Promise<WorkspaceEventList> {
    return this.transport.request({ path: this.workspacePath('events'), signal: options.signal, timeoutMs: options.timeoutMs, parse: (value) => {
      const data = unwrapData(value)
      if (!isRecord(data) || !Array.isArray(data.events)) throw new ResponseValidationError(['workspace event list is invalid.'])
      return { events: data.events as WorkspaceEventList['events'] }
    } })
  }

  createEvent(input: CreateWorkspaceEventInput, options: RequestOptions = {}): Promise<CreateWorkspaceEventReceipt> {
    return this.transport.request({ path: this.workspacePath('events'), method: 'POST', body: input, signal: options.signal, timeoutMs: options.timeoutMs, parse: (value) => {
      const data = unwrapData(value)
      if (!isRecord(data) || !isRecord(data.event)) throw new ResponseValidationError(['workspace event creation receipt is invalid.'])
      return { event: data.event as unknown as CreateWorkspaceEventReceipt['event'] }
    } })
  }

  /** Hosting supplies identity headers. This probes authentication/authorization without a fictional login endpoint. */
  async probeSession(options: RequestOptions = {}): Promise<SessionProbe> {
    try {
      await this.getState(options)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      if (error.status === 401) return { authenticated: false, workspaceId: this.workspaceId, access: 'none' }
      if (error.code === 'WORKSPACE_FORBIDDEN') return { authenticated: true, workspaceId: this.workspaceId, access: 'forbidden' }
      if (error.code === 'ROLE_FORBIDDEN') return { authenticated: true, workspaceId: this.workspaceId, access: 'member' }
      if (error.code !== 'EVENT_STATE_NEEDS_SEED') throw error
    }
    try {
      const members = await this.getMembers(options)
      return { authenticated: true, workspaceId: this.workspaceId, access: 'organizer-or-owner', members }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ROLE_FORBIDDEN') return { authenticated: true, workspaceId: this.workspaceId, access: 'reviewer' }
      throw error
    }
  }
}
