export const APP_SCHEMA_VERSION = 1 as const

export type Id = string
export type ISODateTime = string

export type SubmissionStatus = 'needs-review' | 'in-review' | 'accepted' | 'waitlisted' | 'declined'
export type SpeakerStatus = 'invited' | 'confirmed' | 'declined'
export type TaskKind = 'agreement' | 'profile' | 'session-details' | 'headshot' | 'slides'
export type ReviewCriterion = 'relevance' | 'originality' | 'clarity' | 'speaker-fit'
export type MessageAudience = 'accepted' | 'confirmed' | 'incomplete-onboarding' | 'overdue-tasks' | 'custom'

export type CfpFieldType = 'text' | 'textarea' | 'select' | 'checkbox'

export interface CfpQuestion {
  id: Id
  label: string
  type: CfpFieldType
  required: boolean
  options?: string[]
  showWhen?: { field: 'track' | 'format'; equals: string }
}

export interface CfpConfig {
  open: boolean
  closeAt: ISODateTime
  submissionLimit: number
  allowMultiple: boolean
  welcomeMessage: string
  thankYouMessage: string
  questions: CfpQuestion[]
}

export interface ResourcePage {
  id: Id
  title: string
  body: string
  embedUrl?: string
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
}

export interface AvailabilityWindow {
  startAt: ISODateTime
  endAt: ISODateTime
}

export interface AssetMetadata {
  name: string
  type: string
  size: number
  selectedAt: ISODateTime
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
  tags: string[]
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface Review {
  id: Id
  submissionId: Id
  reviewerName: string
  scores: Record<ReviewCriterion, number>
  note: string
  updatedAt: ISODateTime
}

export interface OnboardingTask {
  id: Id
  speakerId: Id
  kind: TaskKind
  title: string
  dueAt: ISODateTime
  completedAt?: ISODateTime
  asset?: AssetMetadata
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
  tasks: OnboardingTask[]
  sessions: Session[]
  templates: MessageTemplate[]
  communicationLog: CommunicationLog[]
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
  status?: SpeakerStatus
  availability?: AvailabilityWindow[]
}
