import type {
  AppState,
  CommunicationLog,
  EventConfig,
  Id,
  MessageTemplate,
  OnboardingTask,
  Review,
  Session,
  Speaker,
  Submission,
  SubmissionStatus,
  TaskKind,
} from '../domain/types'

export type AppAction =
  | { type: 'state/replace'; state: AppState }
  | { type: 'event/update'; patch: Partial<EventConfig>; at?: string }
  | { type: 'speaker/create'; speaker: Speaker; at?: string }
  | { type: 'speaker/update'; id: Id; patch: Partial<Omit<Speaker, 'id' | 'createdAt'>>; at?: string }
  | { type: 'speaker/delete'; id: Id; at?: string }
  | { type: 'submission/create'; submission: Submission; at?: string }
  | { type: 'submission/update'; id: Id; patch: Partial<Omit<Submission, 'id' | 'createdAt'>>; at?: string }
  | { type: 'submission/delete'; id: Id; at?: string }
  | { type: 'submission/decide'; id: Id; status: SubmissionStatus; at?: string }
  | { type: 'review/upsert'; review: Review; at?: string }
  | { type: 'review/delete'; id: Id; at?: string }
  | { type: 'task/upsert'; task: OnboardingTask; at?: string }
  | { type: 'task/toggle'; id: Id; completed: boolean; asset?: OnboardingTask['asset']; at?: string }
  | { type: 'session/upsert'; session: Session; at?: string }
  | { type: 'session/delete'; id: Id; at?: string }
  | { type: 'agenda/publish'; published: boolean; at?: string }
  | { type: 'template/upsert'; template: MessageTemplate; at?: string }
  | { type: 'template/delete'; id: Id; at?: string }
  | { type: 'communication/log'; entry: CommunicationLog; at?: string }

const taskDefinitions: Array<{ kind: TaskKind; title: string; dueOffsetDays: number }> = [
  { kind: 'agreement', title: 'Sign speaker agreement', dueOffsetDays: 7 },
  { kind: 'profile', title: 'Complete bio and profile', dueOffsetDays: 12 },
  { kind: 'headshot', title: 'Upload headshot', dueOffsetDays: 12 },
  { kind: 'session-details', title: 'Confirm session details', dueOffsetDays: 18 },
  { kind: 'slides', title: 'Upload presentation slides', dueOffsetDays: 28 },
]

function actionTime(action: AppAction, state: AppState): string {
  return 'at' in action && action.at ? action.at : state.lastUpdatedAt
}

function touch(state: AppState, at: string, patch: Partial<AppState>): AppState {
  return { ...state, ...patch, lastUpdatedAt: at }
}

function upsert<T extends { id: Id }>(items: T[], item: T): T[] {
  return items.some((existing) => existing.id === item.id)
    ? items.map((existing) => existing.id === item.id ? item : existing)
    : [...items, item]
}

function addDays(value: string, days: number): string {
  const date = new Date(value)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

function onboardingTasksForSpeaker(speakerId: Id, state: AppState, at: string): OnboardingTask[] {
  const existingKeys = new Set(state.tasks.filter((task) => task.speakerId === speakerId).map((task) => task.kind))
  return taskDefinitions.filter(({ kind }) => !existingKeys.has(kind)).map(({ kind, title, dueOffsetDays }) => ({
    id: `task-${speakerId}-${kind}`,
    speakerId,
    kind,
    title,
    dueAt: addDays(at, dueOffsetDays),
    updatedAt: at,
  }))
}

export function appReducer(state: AppState, action: AppAction): AppState {
  if (action.type === 'state/replace') return action.state
  const at = actionTime(action, state)

  switch (action.type) {
    case 'event/update':
      return touch(state, at, { event: { ...state.event, ...action.patch } })
    case 'speaker/create':
      return touch(state, at, { speakers: upsert(state.speakers, action.speaker) })
    case 'speaker/update':
      return touch(state, at, { speakers: state.speakers.map((speaker) => speaker.id === action.id ? { ...speaker, ...action.patch, updatedAt: at } : speaker) })
    case 'speaker/delete': {
      return touch(state, at, {
        speakers: state.speakers.filter((speaker) => speaker.id !== action.id),
        submissions: state.submissions.map((submission) => ({ ...submission, speakerIds: submission.speakerIds.filter((id) => id !== action.id) })),
        tasks: state.tasks.filter((task) => task.speakerId !== action.id),
        communicationLog: state.communicationLog.map((entry) => ({ ...entry, recipientSpeakerIds: entry.recipientSpeakerIds.filter((id) => id !== action.id) })),
      })
    }
    case 'submission/create':
      return touch(state, at, { submissions: upsert(state.submissions, action.submission) })
    case 'submission/update':
      return touch(state, at, { submissions: state.submissions.map((submission) => submission.id === action.id ? { ...submission, ...action.patch, updatedAt: at } : submission) })
    case 'submission/delete':
      return touch(state, at, {
        submissions: state.submissions.filter((submission) => submission.id !== action.id),
        reviews: state.reviews.filter((review) => review.submissionId !== action.id),
        sessions: state.sessions.filter((session) => session.submissionId !== action.id),
      })
    case 'submission/decide': {
      const submission = state.submissions.find((item) => item.id === action.id)
      if (!submission) return state
      const createdTasks = action.status === 'accepted'
        ? submission.speakerIds.flatMap((speakerId) => onboardingTasksForSpeaker(speakerId, state, at))
        : []
      return touch(state, at, {
        submissions: state.submissions.map((item) => item.id === action.id ? { ...item, status: action.status, updatedAt: at } : item),
        tasks: [...state.tasks, ...createdTasks],
      })
    }
    case 'review/upsert':
      return touch(state, at, {
        reviews: upsert(state.reviews, { ...action.review, updatedAt: at }),
        submissions: state.submissions.map((submission) => submission.id === action.review.submissionId && submission.status === 'needs-review'
          ? { ...submission, status: 'in-review', updatedAt: at }
          : submission),
      })
    case 'review/delete':
      return touch(state, at, { reviews: state.reviews.filter((review) => review.id !== action.id) })
    case 'task/upsert':
      return touch(state, at, { tasks: upsert(state.tasks, { ...action.task, updatedAt: at }) })
    case 'task/toggle':
      return touch(state, at, { tasks: state.tasks.map((task) => task.id === action.id ? {
        ...task,
        completedAt: action.completed ? at : undefined,
        asset: action.asset ?? task.asset,
        updatedAt: at,
      } : task) })
    case 'session/upsert':
      return touch(state, at, { sessions: upsert(state.sessions, { ...action.session, updatedAt: at }) })
    case 'session/delete':
      return touch(state, at, { sessions: state.sessions.filter((session) => session.id !== action.id) })
    case 'agenda/publish':
      return touch(state, at, {
        event: { ...state.event, agendaPublishedAt: action.published ? at : undefined },
        sessions: state.sessions.map((session) => ({ ...session, published: action.published, updatedAt: at })),
      })
    case 'template/upsert':
      return touch(state, at, { templates: upsert(state.templates, { ...action.template, updatedAt: at }) })
    case 'template/delete':
      return touch(state, at, { templates: state.templates.filter((template) => template.id !== action.id) })
    case 'communication/log':
      return touch(state, at, { communicationLog: upsert(state.communicationLog, action.entry) })
  }
}
