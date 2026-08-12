export const APP_SCHEMA_VERSION = 1 as const

export type Id = string
export type ISODateTime = string

export type SubmissionStatus = 'needs-review' | 'in-review' | 'accepted' | 'waitlisted' | 'declined'
export type SpeakerStatus = 'invited' | 'confirmed' | 'declined'
export type TaskKind = 'agreement' | 'profile' | 'session-details' | 'headshot' | 'slides' | 'supporting-document'
export type ReviewCriterion = 'relevance' | 'originality' | 'clarity' | 'speaker-fit'
export type MessageAudience = 'accepted' | 'confirmed' | 'incomplete-onboarding' | 'overdue-tasks' | 'custom'
export type EvaluationRoundStatus = 'draft' | 'open' | 'closed'
export type EvaluationAssignmentStatus = 'assigned' | 'in-progress' | 'completed' | 'abstained'
export type SubmissionOrigin = 'cfp' | 'invited' | 'manual'
export type ApprovalStatus = 'draft' | 'pending' | 'approved' | 'changes-requested' | 'archived'

export type CfpFieldType = 'text' | 'textarea' | 'select' | 'checkbox'

export interface CfpQuestion {
  id: Id
  label: string
  type: CfpFieldType
  required: boolean
  options?: string[]
  showWhen?: { field: 'track' | 'format'; equals: string }
  /** Server-compatible rules; field may reference track, format, or a prior question id. */
  conditions?: Array<{ field: string; operator?: 'equals' | 'notEquals'; value: string }>
}

export interface CfpRoutingRule {
  id: Id
  category: string
  label: string
  track: string
  format?: string
  enabled: boolean
}

export interface CfpConfig {
  open: boolean
  closeAt: ISODateTime
  submissionLimit: number
  allowMultiple: boolean
  welcomeMessage: string
  thankYouMessage: string
  questions: CfpQuestion[]
  /** Incremented when an organizer publishes a changed form. */
  version?: number
  publishedAt?: ISODateTime
  formats?: Array<{ name: string; durationMinutes: number }>
  routingRules?: CfpRoutingRule[]
}

export interface ResourceFile {
  id: Id
  name: string
  assetId?: Id
  url?: string
  contentType: string
  size: number
  version: number
  approvalStatus: ApprovalStatus
  uploadedAt: ISODateTime
  approvedAt?: ISODateTime
  reviewerNote?: string
}

export interface ResourcePage {
  id: Id
  title: string
  body: string
  embedUrl?: string
  version?: number
  approvalStatus?: ApprovalStatus
  updatedAt?: ISODateTime
  files?: ResourceFile[]
}

export interface ReminderSchedule {
  id: Id
  name: string
  templateId: Id
  audience: MessageAudience
  enabled: boolean
  cadence: 'once' | 'daily' | 'weekly'
  daysBeforeDue?: number
  sendAt?: ISODateTime
  nextRunAt?: ISODateTime
  lastRunAt?: ISODateTime
  timezone: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface PublicProgramConfig {
  defaultView: 'list' | 'day' | 'week' | 'track' | 'room'
  enabledViews: Array<'list' | 'day' | 'week' | 'track' | 'room'>
  showSpeakers: boolean
  showItinerary: boolean
  showCalendarDownloads: boolean
  embedHeight: number
}

export interface EventEmbedDefinition {
  id: Id
  name: string
  type: 'sessions' | 'speakers' | 'agenda' | 'itinerary' | 'gallery'
  format: 'styled-html' | 'basic-html' | 'json' | 'xml' | 'ical'
  enabled: boolean
  accentColor: string
  backgroundColor: string
  customCss: string
  track?: string
  sessionFormat?: string
  room?: string
  visibleFields: string[]
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface AcceleventsMapping {
  sessionTitle: 'title'
  description: 'abstract'
  track: 'track'
  type: 'format'
  location: 'room'
  speakers: 'speakers'
  includeOnlyConfirmedSpeakers: boolean
  includeOnlyPublishedSessions: boolean
  destinationFields?: { title: string; description: string; track: string; type: string; location: string; speakers: string }
  lastRunId?: Id
  lastStatus?: 'idle' | 'running' | 'succeeded' | 'failed'
  lastSyncedAt?: ISODateTime
  lastError?: string
}

export interface EventConfig {
  id: Id
  name: string
  slug: string
  venue: string
  timezone: string
  startAt: ISODateTime
  endAt: ISODateTime
  rooms: string[]
  tracks: string[]
  agendaPublishedAt?: ISODateTime
  description?: string
  cfp?: CfpConfig
  resources?: ResourcePage[]
  reminderSchedules?: ReminderSchedule[]
  publicProgram?: PublicProgramConfig
  embeds?: EventEmbedDefinition[]
  accelevents?: AcceleventsMapping
}

export interface AvailabilityWindow {
  startAt: ISODateTime
  endAt: ISODateTime
}

export interface AssetMetadata {
  id?: Id
  name: string
  type: string
  size: number
  selectedAt: ISODateTime
  storage?: 'local-metadata' | 'r2'
}

export interface DeliverableVersion {
  id: Id
  asset: AssetMetadata
  version: number
  uploadedAt: ISODateTime
  uploadedBy: string
}

export interface DeliverableComment {
  id: Id
  authorName: string
  authorRole: 'speaker' | 'organizer'
  body: string
  createdAt: ISODateTime
}

export interface Speaker {
  id: Id
  firstName: string
  lastName: string
  email: string
  company: string
  jobTitle: string
  bio: string
  pronouns?: string
  photoUrl?: string
  twitterUrl?: string
  linkedinUrl?: string
  travelPreferences?: string
  status: SpeakerStatus
  availability: AvailabilityWindow[]
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface Submission {
  id: Id
  title: string
  abstract: string
  track: string
  format: string
  durationMinutes: number
  speakerIds: Id[]
  status: SubmissionStatus
  /** Speaker-owned working state; omitted legacy records are submitted. */
  lifecycle?: 'draft' | 'submitted'
  tags: string[]
  createdAt: ISODateTime
  updatedAt: ISODateTime
  sourceSubmissionId?: Id
  source?: string
  customAnswers?: Record<string, unknown>
  sourcePayload?: Record<string, unknown>
  origin?: SubmissionOrigin
  cfpVersion?: number
  invitedAt?: ISODateTime
}

export interface Review {
  id: Id
  submissionId: Id
  reviewerName: string
  /** Legacy reviews may not have a round or assignment. */
  roundId?: Id
  assignmentId?: Id
  scores: Record<string, number>
  /** Typed rubric answers. Numeric answers are mirrored in scores for backwards compatibility. */
  answers?: Record<string, number | string>
  note: string
  updatedAt: ISODateTime
}

export interface RubricCriterion {
  id: Id
  label: string
  description?: string
  /** Relative weight. A round's positive weights are normalized at scoring time. */
  weight: number
  /** Omitted by legacy data and interpreted as a numeric rating. */
  type?: 'rating' | 'select' | 'text'
  maxScore: number
  /** Required for select criteria and ignored by numeric/text criteria. */
  options?: string[]
  required?: boolean
}

export interface EvaluationReviewer {
  name: string
  email: string
}

export interface EvaluationPlan {
  id: Id
  name: string
  instructions: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface EvaluationRoundFilter {
  tracks?: string[]
  formats?: string[]
  submissionStatuses?: SubmissionStatus[]
}

export interface EvaluationRound {
  id: Id
  planId: Id
  name: string
  position: number
  status: EvaluationRoundStatus
  opensAt?: ISODateTime
  dueAt: ISODateTime
  blind: boolean
  instructions: string
  rubric: RubricCriterion[]
  /** Reviewers eligible for this round, independent of individual assignments. */
  reviewerPool?: EvaluationReviewer[]
  filter?: EvaluationRoundFilter
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface EvaluationAssignment {
  id: Id
  roundId: Id
  submissionId: Id
  reviewerName: string
  reviewerEmail: string
  status: EvaluationAssignmentStatus
  assignedAt: ISODateTime
  startedAt?: ISODateTime
  completedAt?: ISODateTime
  abstainedAt?: ISODateTime
  abstainReason?: string
  updatedAt: ISODateTime
}

export interface EvaluationAdvancement {
  id: Id
  planId: Id
  submissionId: Id
  fromRoundId: Id
  toRoundId: Id
  advancedAt: ISODateTime
}

export interface OnboardingTask {
  id: Id
  speakerId: Id
  kind: TaskKind
  title: string
  instructions?: string
  submissionId?: Id
  dueAt: ISODateTime
  completedAt?: ISODateTime
  asset?: AssetMetadata
  assetVersion?: number
  approvalStatus?: ApprovalStatus
  approvedAt?: ISODateTime
  reviewerNote?: string
  deliverableVersions?: DeliverableVersion[]
  comments?: DeliverableComment[]
  updatedAt: ISODateTime
}

export interface Session {
  id: Id
  submissionId: Id
  room: string
  startAt: ISODateTime
  endAt: ISODateTime
  published: boolean
  updatedAt: ISODateTime
}

export interface MessageTemplate {
  id: Id
  name: string
  subject: string
  body: string
  audience: MessageAudience
  enabled: boolean
  updatedAt: ISODateTime
}

export interface CommunicationLog {
  id: Id
  templateId?: Id
  recipientSpeakerIds: Id[]
  subject: string
  body: string
  channel: 'in-app-outbox' | 'email'
  status: 'queued' | 'sent' | 'failed'
  sentAt: ISODateTime
}

export interface AppState {
  schemaVersion: typeof APP_SCHEMA_VERSION
  lastUpdatedAt: ISODateTime
  event: EventConfig
  speakers: Speaker[]
  submissions: Submission[]
  reviews: Review[]
  /** Optional for backwards compatibility with schema-v1 browser backups. */
  evaluationPlans?: EvaluationPlan[]
  evaluationRounds?: EvaluationRound[]
  evaluationAssignments?: EvaluationAssignment[]
  evaluationAdvancements?: EvaluationAdvancement[]
  tasks: OnboardingTask[]
  sessions: Session[]
  templates: MessageTemplate[]
  communicationLog: CommunicationLog[]
  deletedSourceSubmissionIds?: Id[]
}

export interface SubmissionInput {
  title: string
  abstract: string
  track: string
  format: string
  durationMinutes: number
  speakerIds: Id[]
  status?: SubmissionStatus
  tags?: string[]
}

export interface SpeakerInput {
  firstName: string
  lastName: string
  email: string
  company?: string
  jobTitle?: string
  bio?: string
  pronouns?: string
  photoUrl?: string
  twitterUrl?: string
  linkedinUrl?: string
  travelPreferences?: string
  status?: SpeakerStatus
  availability?: AvailabilityWindow[]
}
