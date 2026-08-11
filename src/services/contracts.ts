import type { AppState, AvailabilityWindow, EvaluationAssignment, EvaluationAssignmentStatus, EvaluationRoundStatus, EventConfig, Id, OnboardingTask, Review, RubricCriterion, Session, Speaker, Submission, SubmissionStatus } from '../domain'

export type WorkspaceRole = 'owner' | 'organizer' | 'reviewer' | 'speaker'

export interface ApiClientScope {
  workspaceId: string
  eventId: string
  eventSlug: string
}

export interface RequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

export interface StateWriteOptions extends RequestOptions {
  /** 0 seeds an event that does not have server state yet. */
  revision: number
}

export interface EventRecord {
  id: Id
  name: string
  slug: string
  cfpOpen: boolean
  cfpConfig: Record<string, unknown>
}

export interface VersionedAppState {
  event: EventRecord
  state: AppState
  revision: number
  updatedAt: string
}

export interface AppStateDataSource {
  getState(options?: RequestOptions): Promise<VersionedAppState>
  putState(state: AppState, options: StateWriteOptions): Promise<VersionedAppState>
}

export interface SessionProbe {
  authenticated: boolean
  workspaceId: string
  access: 'none' | 'forbidden' | 'member' | 'reviewer' | 'organizer-or-owner'
  members?: WorkspaceMember[]
}

export interface WorkspaceSession {
  user: { id: Id; email: string; name: string }
  role: WorkspaceRole
}

export interface PublicEventSummary {
  id: Id
  name: string
  slug: string
}

export interface PublicEventState {
  event: PublicEventSummary
  revision: number
  state: AppState
  updatedAt: string
}

export interface PublicCfpMetadata {
  event: PublicEventSummary
  config: Record<string, unknown>
  revision: number
  state: AppState | null
}

export interface PublicCfpSubmissionInput {
  [key: string]: unknown
  title: string
  abstract: string
  speakerName: string
  speakerEmail: string
  track?: string
  format?: string
  consent: true
  coSpeakers?: Array<{ name: string; email: string; [key: string]: unknown }>
  customAnswers?: Record<string, unknown>
}

export interface PublicCfpSubmissionReceipt {
  id: Id
  status: 'needs-review'
  submittedAt: string
}

export interface UploadedAsset {
  id: Id
  fileName: string
  contentType: string
  sizeBytes: number
  createdAt: string
}

export interface DownloadedAsset {
  blob: Blob
  fileName: string
  contentType: string
  sizeBytes: number
  etag?: string
}

export interface WorkspaceMember {
  id: Id
  email: string
  name: string
  role: WorkspaceRole
  createdAt: string
}

export interface MemberInput {
  userId: Id
  email: string
  name?: string
  role: WorkspaceRole
}

export interface MemberMutationReceipt {
  userId: Id
  role: WorkspaceRole
}

export interface AuditEntry {
  id: Id
  actorUserId: Id | null
  action: string
  entityType: string
  entityId: Id
  metadata: Record<string, unknown>
  requestId: string
  createdAt: string
}

export interface PublicSubmissionRecord {
  id: Id
  title: string
  abstract: string
  speakerName: string
  speakerEmail: string
  track: string
  format: string
  status: SubmissionStatus
  createdAt: string
  updatedAt: string
}

export interface SubmissionStatusReceipt {
  id: Id
  status: SubmissionStatus
  updatedAt: string
}

export interface HealthStatus {
  status: 'ok'
  database: 'ok'
  files: boolean
  timestamp: string
}

export type IntegrationProvider = 'resend' | 'accelevents'
export type IntegrationRunStatus = 'running' | 'sent' | 'succeeded' | 'partial' | 'failed'

export interface IntegrationRun {
  id: Id
  provider: IntegrationProvider
  action: 'email.send' | 'program.sync'
  idempotencyKey: string
  status: IntegrationRunStatus
  response: Record<string, unknown>
  errorCode?: string
  errorMessage?: string
  startedBy: Id
  createdAt: string
  completedAt?: string
}

export interface MessageDelivery {
  id: Id
  runId: Id
  idempotencyKey: string
  recipientSpeakerId: Id
  recipientEmail: string
  subject: string
  providerMessageId?: string
  status: 'queued' | 'sent' | 'failed'
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export interface IntegrationStatus {
  configured: { resend: boolean; accelevents: boolean }
  runs: IntegrationRun[]
  deliveries: MessageDelivery[]
}

export type IntegrationLogs = Pick<IntegrationStatus, 'runs' | 'deliveries'>

export interface EmailMessageInput {
  speakerId: Id
  subject: string
  text?: string
  html?: string
  attachment?: {
    filename: string
    content: string
    type: 'text/calendar'
  }
}

export interface SendEmailInput {
  idempotencyKey: string
  replyTo?: string
  messages: EmailMessageInput[]
}

export interface EmailDeliveryResult {
  speakerId: Id
  deliveryId: Id
  status: 'sent' | 'failed'
  providerMessageId?: string
  error?: string
}

export interface SendEmailReceipt {
  runId: Id
  status: IntegrationRunStatus
  replayed: boolean
  result: {
    sent?: number
    failed?: number
    deliveries?: EmailDeliveryResult[]
    [key: string]: unknown
  }
  errorCode?: string
  errorMessage?: string
}

export interface AcceleventsSyncReceipt {
  runId: Id
  status: IntegrationRunStatus
  replayed: boolean
  result: Record<string, unknown>
  synced?: { sessions: number; speakers: number }
}

export interface SpeakerPortalResource {
  id: Id
  title: string
  body: string
  embedUrl?: string
  description?: string
  url?: string
  type?: string
}

export interface SpeakerPortalAsset {
  id: Id
  fileName: string
  contentType: string
  sizeBytes: number
  createdAt: string
  downloadUrl: string
}

export interface SpeakerPortalProjection {
  event: EventConfig
  speaker: Speaker
  submissions: Submission[]
  tasks: OnboardingTask[]
  sessions: Session[]
  resources: SpeakerPortalResource[]
  assets: SpeakerPortalAsset[]
}

export interface VersionedSpeakerPortal {
  revision: number
  portal: SpeakerPortalProjection
}

export interface SpeakerPortalProfilePatch {
  firstName?: string
  lastName?: string
  company?: string
  jobTitle?: string
  bio?: string
  pronouns?: string
  photoUrl?: string
  availability?: AvailabilityWindow[]
  status?: 'invited' | 'confirmed' | 'declined'
}

export interface SpeakerPortalTaskUpdate {
  id: Id
  completed?: boolean
  assetId?: Id
}

export interface SpeakerPortalPatch {
  expectedRevision: number
  profile?: SpeakerPortalProfilePatch
  taskUpdates?: SpeakerPortalTaskUpdate[]
}

export interface ReviewerQueueReview extends Review {
  reviewerEmail?: string
  reviewerUserId?: Id
  abstained?: boolean
}

export interface ReviewerQueue {
  revision: number
  event: EventConfig
  assignments: Array<EvaluationAssignment & { blind?: boolean; planId?: Id }>
  rounds: Array<{
    id: Id
    planId: Id
    name: string
    rubric: RubricCriterion[]
    instructions: string
    status: EvaluationRoundStatus
    dueAt: string
    blind: boolean
  }>
  plans: Array<{ id: Id; name?: string; label?: string }>
  submissions: Submission[]
  speakers: Speaker[]
  reviews: ReviewerQueueReview[]
}

export interface ReviewerMutationInput {
  expectedRevision: number
  assignmentId: Id
  submissionId: Id
  review: { scores: Record<string, number>; note?: string }
  assignmentStatus?: EvaluationAssignmentStatus
  abstain?: boolean
}

export interface ReviewerMutationReceipt {
  revision: number
  review: ReviewerQueueReview
  assignment: EvaluationAssignment
}
