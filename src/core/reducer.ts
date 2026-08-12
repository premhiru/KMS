import type {
  AppState,
  CommunicationLog,
  EvaluationAdvancement,
  EvaluationAssignment,
  EvaluationPlan,
  EvaluationRound,
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
  | { type: 'evaluation/plan/upsert'; plan: EvaluationPlan; at?: string }
  | { type: 'evaluation/plan/delete'; id: Id; at?: string }
  | { type: 'evaluation/round/upsert'; round: EvaluationRound; at?: string }
  | { type: 'evaluation/round/delete'; id: Id; at?: string }
  | { type: 'evaluation/assignment/upsert'; assignment: EvaluationAssignment; at?: string }
  | { type: 'evaluation/assignment/delete'; id: Id; at?: string }
  | { type: 'evaluation/assignment/start'; id: Id; at?: string }
  | { type: 'evaluation/assignment/abstain'; id: Id; reason: string; at?: string }
  | { type: 'evaluation/assignment/reopen'; id: Id; at?: string }
  | { type: 'evaluation/advance'; advancement: EvaluationAdvancement; assignments: EvaluationAssignment[]; at?: string }
  | { type: 'task/upsert'; task: OnboardingTask; at?: string }
  | { type: 'task/toggle'; id: Id; completed: boolean; asset?: OnboardingTask['asset']; uploadedBy?: string; at?: string }
  | { type: 'task/review'; id: Id; status: NonNullable<OnboardingTask['approvalStatus']>; note?: string; at?: string }
  | { type: 'task/comment'; id: Id; comment: NonNullable<OnboardingTask['comments']>[number]; at?: string }
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
  { kind: 'supporting-document', title: 'Upload supporting document', dueOffsetDays: 28 },
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

function upsertAssignment(items: EvaluationAssignment[], item: EvaluationAssignment): EvaluationAssignment[] {
  const byId = items.find((candidate) => candidate.id === item.id)
  if (byId) return items.map((candidate) => candidate.id === item.id ? item : candidate)
  const existing = items.find((candidate) => (
    candidate.roundId === item.roundId
    && candidate.submissionId === item.submissionId
    && candidate.reviewerEmail.toLowerCase() === item.reviewerEmail.toLowerCase()
  ))
  return existing
    ? items.map((candidate) => candidate.id === existing.id ? {
      ...item,
      id: existing.id,
      status: existing.status,
      assignedAt: existing.assignedAt,
      startedAt: existing.startedAt,
      completedAt: existing.completedAt,
      abstainedAt: existing.abstainedAt,
      abstainReason: existing.abstainReason,
    } : candidate)
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
    case 'submission/delete': {
      const deleted = state.submissions.find((submission) => submission.id === action.id)
      return touch(state, at, {
        submissions: state.submissions.filter((submission) => submission.id !== action.id),
        reviews: state.reviews.filter((review) => review.submissionId !== action.id),
        evaluationAssignments: (state.evaluationAssignments ?? []).filter((assignment) => assignment.submissionId !== action.id),
        evaluationAdvancements: (state.evaluationAdvancements ?? []).filter((advancement) => advancement.submissionId !== action.id),
        sessions: state.sessions.filter((session) => session.submissionId !== action.id),
        deletedSourceSubmissionIds: deleted?.sourceSubmissionId ? [...new Set([...(state.deletedSourceSubmissionIds ?? []), deleted.sourceSubmissionId])] : state.deletedSourceSubmissionIds,
      })
    }
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
    case 'review/upsert': {
      const assignmentId = action.review.assignmentId
      return touch(state, at, {
        reviews: upsert(state.reviews, { ...action.review, updatedAt: at }),
        evaluationAssignments: (state.evaluationAssignments ?? []).map((assignment) => assignment.id === assignmentId ? {
          ...assignment,
          status: 'completed',
          completedAt: at,
          abstainedAt: undefined,
          abstainReason: undefined,
          updatedAt: at,
        } : assignment),
        submissions: state.submissions.map((submission) => submission.id === action.review.submissionId && submission.status === 'needs-review'
          ? { ...submission, status: 'in-review', updatedAt: at }
          : submission),
      })
    }
    case 'review/delete': {
      const review = state.reviews.find((item) => item.id === action.id)
      return touch(state, at, {
        reviews: state.reviews.filter((item) => item.id !== action.id),
        evaluationAssignments: (state.evaluationAssignments ?? []).map((assignment) => assignment.id === review?.assignmentId ? {
          ...assignment,
          status: 'in-progress',
          completedAt: undefined,
          updatedAt: at,
        } : assignment),
      })
    }
    case 'evaluation/plan/upsert':
      return touch(state, at, { evaluationPlans: upsert(state.evaluationPlans ?? [], { ...action.plan, updatedAt: at }) })
    case 'evaluation/plan/delete': {
      const roundIds = new Set((state.evaluationRounds ?? []).filter((round) => round.planId === action.id).map((round) => round.id))
      const assignmentIds = new Set((state.evaluationAssignments ?? []).filter((assignment) => roundIds.has(assignment.roundId)).map((assignment) => assignment.id))
      return touch(state, at, {
        evaluationPlans: (state.evaluationPlans ?? []).filter((plan) => plan.id !== action.id),
        evaluationRounds: (state.evaluationRounds ?? []).filter((round) => !roundIds.has(round.id)),
        evaluationAssignments: (state.evaluationAssignments ?? []).filter((assignment) => !roundIds.has(assignment.roundId)),
        evaluationAdvancements: (state.evaluationAdvancements ?? []).filter((advancement) => advancement.planId !== action.id),
        reviews: state.reviews.filter((review) => !roundIds.has(review.roundId ?? '') && !assignmentIds.has(review.assignmentId ?? '')),
      })
    }
    case 'evaluation/round/upsert':
      return touch(state, at, { evaluationRounds: upsert(state.evaluationRounds ?? [], { ...action.round, updatedAt: at }) })
    case 'evaluation/round/delete': {
      const assignmentIds = new Set((state.evaluationAssignments ?? []).filter((assignment) => assignment.roundId === action.id).map((assignment) => assignment.id))
      return touch(state, at, {
        evaluationRounds: (state.evaluationRounds ?? []).filter((round) => round.id !== action.id),
        evaluationAssignments: (state.evaluationAssignments ?? []).filter((assignment) => assignment.roundId !== action.id),
        evaluationAdvancements: (state.evaluationAdvancements ?? []).filter((advancement) => advancement.fromRoundId !== action.id && advancement.toRoundId !== action.id),
        reviews: state.reviews.filter((review) => review.roundId !== action.id && !assignmentIds.has(review.assignmentId ?? '')),
      })
    }
    case 'evaluation/assignment/upsert':
      return touch(state, at, { evaluationAssignments: upsertAssignment(state.evaluationAssignments ?? [], { ...action.assignment, reviewerEmail: action.assignment.reviewerEmail.trim().toLowerCase(), updatedAt: at }) })
    case 'evaluation/assignment/delete':
      return touch(state, at, {
        evaluationAssignments: (state.evaluationAssignments ?? []).filter((assignment) => assignment.id !== action.id),
        reviews: state.reviews.filter((review) => review.assignmentId !== action.id),
      })
    case 'evaluation/assignment/start':
      return touch(state, at, { evaluationAssignments: (state.evaluationAssignments ?? []).map((assignment) => assignment.id === action.id && assignment.status === 'assigned' ? { ...assignment, status: 'in-progress', startedAt: at, updatedAt: at } : assignment) })
    case 'evaluation/assignment/abstain':
      return touch(state, at, {
        evaluationAssignments: (state.evaluationAssignments ?? []).map((assignment) => assignment.id === action.id ? { ...assignment, status: 'abstained', abstainedAt: at, abstainReason: action.reason.trim(), completedAt: undefined, updatedAt: at } : assignment),
        reviews: state.reviews.filter((review) => review.assignmentId !== action.id),
      })
    case 'evaluation/assignment/reopen':
      return touch(state, at, { evaluationAssignments: (state.evaluationAssignments ?? []).map((assignment) => assignment.id === action.id ? { ...assignment, status: 'in-progress', startedAt: assignment.startedAt ?? at, completedAt: undefined, abstainedAt: undefined, abstainReason: undefined, updatedAt: at } : assignment) })
    case 'evaluation/advance': {
      const existingAdvancement = (state.evaluationAdvancements ?? []).find((advancement) => advancement.planId === action.advancement.planId && advancement.submissionId === action.advancement.submissionId && advancement.fromRoundId === action.advancement.fromRoundId && advancement.toRoundId === action.advancement.toRoundId)
      const advancements = existingAdvancement ? state.evaluationAdvancements ?? [] : [...(state.evaluationAdvancements ?? []), action.advancement]
      const assignments = action.assignments.reduce((items, assignment) => {
        const email = assignment.reviewerEmail.trim().toLowerCase()
        const alreadyAssigned = items.some((item) => item.roundId === assignment.roundId && item.submissionId === assignment.submissionId && item.reviewerEmail.toLowerCase() === email)
        return alreadyAssigned ? items : [...items, { ...assignment, reviewerEmail: email, updatedAt: at }]
      }, state.evaluationAssignments ?? [])
      return touch(state, at, {
        evaluationAdvancements: advancements,
        evaluationAssignments: assignments,
        submissions: state.submissions.map((submission) => submission.id === action.advancement.submissionId && submission.status === 'needs-review' ? { ...submission, status: 'in-review', updatedAt: at } : submission),
      })
    }
    case 'task/upsert':
      return touch(state, at, { tasks: upsert(state.tasks, { ...action.task, updatedAt: at }) })
    case 'task/toggle':
      return touch(state, at, { tasks: state.tasks.map((task) => {
        if (task.id !== action.id) return task
        const version = action.asset ? Math.max(task.assetVersion ?? 0, task.deliverableVersions?.at(-1)?.version ?? 0) + 1 : task.assetVersion
        return {
          ...task,
          completedAt: action.completed ? at : undefined,
          asset: action.asset ?? task.asset,
          assetVersion: version,
          deliverableVersions: action.asset ? [...(task.deliverableVersions ?? []), {
            id: action.asset.id ?? `deliverable-${task.id}-${version}`,
            asset: action.asset,
            version: version ?? 1,
            uploadedAt: action.asset.selectedAt,
            uploadedBy: action.uploadedBy?.trim() || 'Speaker',
          }] : task.deliverableVersions,
          approvalStatus: action.asset ? 'pending' : task.approvalStatus,
          approvedAt: action.asset ? undefined : task.approvedAt,
          updatedAt: at,
        }
      }) })
    case 'task/review':
      return touch(state, at, { tasks: state.tasks.map((task) => task.id === action.id ? {
        ...task,
        approvalStatus: action.status,
        approvedAt: action.status === 'approved' ? at : undefined,
        reviewerNote: action.note?.trim() || undefined,
        updatedAt: at,
      } : task) })
    case 'task/comment':
      return touch(state, at, { tasks: state.tasks.map((task) => task.id === action.id ? {
        ...task,
        comments: [...(task.comments ?? []), action.comment],
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
