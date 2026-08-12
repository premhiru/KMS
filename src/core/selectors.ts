import { reviewAverage } from '../domain/rules'
import type { AppState, EvaluationAssignmentStatus, EvaluationRound, Id, MessageAudience, OnboardingTask, Review, Speaker, Submission } from '../domain/types'

export function speakerName(speaker: Pick<Speaker, 'firstName' | 'lastName'>): string {
  return `${speaker.firstName} ${speaker.lastName}`.trim()
}

export function selectSpeaker(state: AppState, id: Id): Speaker | undefined {
  return state.speakers.find((speaker) => speaker.id === id)
}

export function selectSubmission(state: AppState, id: Id): Submission | undefined {
  return state.submissions.find((submission) => submission.id === id)
}

export function selectSubmissionSpeakers(state: AppState, submissionId: Id): Speaker[] {
  const submission = selectSubmission(state, submissionId)
  return submission ? state.speakers.filter((speaker) => submission.speakerIds.includes(speaker.id)) : []
}

export function selectReviewsForSubmission(state: AppState, submissionId: Id) {
  return state.reviews.filter((review) => review.submissionId === submissionId)
}

export function selectSubmissionScore(state: AppState, submissionId: Id): number | undefined {
  const reviews = selectReviewsForSubmission(state, submissionId)
  if (reviews.length === 0) return undefined
  return reviews.reduce((sum, review) => sum + reviewAverage(review.scores), 0) / reviews.length
}

export function selectEvaluationRounds(state: AppState, planId?: Id): EvaluationRound[] {
  return (state.evaluationRounds ?? [])
    .filter((round) => !planId || round.planId === planId)
    .sort((left, right) => left.position - right.position || left.createdAt.localeCompare(right.createdAt))
}

export function selectRoundAssignments(state: AppState, roundId: Id) {
  return (state.evaluationAssignments ?? []).filter((assignment) => assignment.roundId === roundId)
}

export function selectEligibleSubmissionsForRound(state: AppState, round: EvaluationRound): Submission[] {
  const filter = round.filter
  return state.submissions.filter((submission) => (
    submission.lifecycle !== 'draft'
    && (!filter?.tracks?.length || filter.tracks.includes(submission.track))
    && (!filter?.formats?.length || filter.formats.includes(submission.format))
    && (!filter?.submissionStatuses?.length || filter.submissionStatuses.includes(submission.status))
  ))
}

export function weightedReviewAverage(round: Pick<EvaluationRound, 'rubric'>, review: Pick<Review, 'scores'>): number {
  const weighted = round.rubric.filter((criterion) => (criterion.type ?? 'rating') === 'rating' && criterion.weight > 0 && criterion.maxScore > 0 && Number.isFinite(review.scores[criterion.id]))
  const totalWeight = weighted.reduce((sum, criterion) => sum + criterion.weight, 0)
  if (totalWeight === 0) return 0
  const normalized = weighted.reduce((sum, criterion) => sum + (Math.max(0, Math.min(criterion.maxScore, review.scores[criterion.id])) / criterion.maxScore) * criterion.weight, 0) / totalWeight
  return normalized * 5
}

export interface ReviewerProgress {
  reviewerName: string
  reviewerEmail: string
  assigned: number
  completed: number
  abstained: number
  remaining: number
  percent: number
}

export function selectReviewerProgress(state: AppState, roundId: Id): ReviewerProgress[] {
  const grouped = new Map<string, ReviewerProgress>()
  for (const assignment of selectRoundAssignments(state, roundId)) {
    const email = assignment.reviewerEmail.trim().toLowerCase()
    const current = grouped.get(email) ?? { reviewerName: assignment.reviewerName, reviewerEmail: email, assigned: 0, completed: 0, abstained: 0, remaining: 0, percent: 0 }
    current.assigned += 1
    if (assignment.status === 'completed') current.completed += 1
    if (assignment.status === 'abstained') current.abstained += 1
    grouped.set(email, current)
  }
  return [...grouped.values()].map((row) => {
    const terminal = row.completed + row.abstained
    return { ...row, remaining: row.assigned - terminal, percent: row.assigned === 0 ? 0 : Math.round(terminal / row.assigned * 100) }
  }).sort((left, right) => left.reviewerName.localeCompare(right.reviewerName) || left.reviewerEmail.localeCompare(right.reviewerEmail))
}

export interface RoundResultRow {
  submission: Submission
  reviewCount: number
  aggregate?: number
}

export function selectRoundResults(state: AppState, roundId: Id): RoundResultRow[] {
  const submissionIds = [...new Set(selectRoundAssignments(state, roundId).map((assignment) => assignment.submissionId))]
  return submissionIds.flatMap((submissionId) => {
    const submission = selectSubmission(state, submissionId)
    if (!submission) return []
    const reviews = state.reviews.filter((review) => review.roundId === roundId && review.submissionId === submissionId)
    return [{ submission, reviewCount: reviews.length, aggregate: selectRoundSubmissionScore(state, roundId, submissionId) }]
  })
}

export function selectWeightedReviewScore(state: AppState, review: Review): number {
  const round = (state.evaluationRounds ?? []).find((item) => item.id === review.roundId)
  return round ? weightedReviewAverage(round, review) : reviewAverage(review.scores)
}

export function selectRoundSubmissionScore(state: AppState, roundId: Id, submissionId: Id): number | undefined {
  const reviews = state.reviews.filter((review) => review.roundId === roundId && review.submissionId === submissionId)
  if (reviews.length === 0) return undefined
  return reviews.reduce((sum, review) => sum + selectWeightedReviewScore(state, review), 0) / reviews.length
}

export function selectEvaluationRoundProgress(state: AppState, roundId: Id) {
  const assignments = selectRoundAssignments(state, roundId)
  const completed = assignments.filter((assignment) => assignment.status === 'completed').length
  const abstained = assignments.filter((assignment) => assignment.status === 'abstained').length
  const terminal = completed + abstained
  return {
    total: assignments.length,
    assigned: assignments.filter((assignment) => assignment.status === 'assigned').length,
    inProgress: assignments.filter((assignment) => assignment.status === 'in-progress').length,
    completed,
    abstained,
    terminal,
    percent: assignments.length === 0 ? 0 : Math.round(terminal / assignments.length * 100),
  }
}

export interface ReviewerQueueItem {
  assignment: NonNullable<AppState['evaluationAssignments']>[number]
  round: EvaluationRound
  submission: Submission
  speakers: Speaker[]
  blind: boolean
}

export interface ReviewerQueueOptions {
  roundId?: Id
  statuses?: EvaluationAssignmentStatus[]
}

export function selectReviewerQueue(state: AppState, reviewerEmail: string, options: ReviewerQueueOptions = {}): ReviewerQueueItem[] {
  const email = reviewerEmail.trim().toLowerCase()
  const rounds = new Map((state.evaluationRounds ?? []).map((round) => [round.id, round]))
  return (state.evaluationAssignments ?? []).flatMap((assignment) => {
    if (assignment.reviewerEmail.trim().toLowerCase() !== email || (options.roundId && assignment.roundId !== options.roundId) || (options.statuses && !options.statuses.includes(assignment.status))) return []
    const round = rounds.get(assignment.roundId)
    const submission = state.submissions.find((item) => item.id === assignment.submissionId)
    if (!round || !submission) return []
    const blind = round.blind
    const visibleSubmission = blind ? { ...submission, speakerIds: [] } : submission
    return [{ assignment, round, submission: visibleSubmission, speakers: blind ? [] : selectSubmissionSpeakers(state, submission.id), blind }]
  }).sort((left, right) => left.round.position - right.round.position || left.assignment.assignedAt.localeCompare(right.assignment.assignedAt))
}

export function selectNextEvaluationRound(state: AppState, roundId: Id): EvaluationRound | undefined {
  const current = (state.evaluationRounds ?? []).find((round) => round.id === roundId)
  if (!current) return undefined
  return selectEvaluationRounds(state, current.planId).find((round) => round.position > current.position)
}

export function hasAdvancedSubmission(state: AppState, submissionId: Id, fromRoundId: Id, toRoundId: Id): boolean {
  return (state.evaluationAdvancements ?? []).some((advancement) => advancement.submissionId === submissionId && advancement.fromRoundId === fromRoundId && advancement.toRoundId === toRoundId)
}

export function selectTasksForSpeaker(state: AppState, speakerId: Id): OnboardingTask[] {
  return state.tasks.filter((task) => task.speakerId === speakerId)
}

export function selectOnboardingPercent(state: AppState, speakerId: Id): number {
  const tasks = selectTasksForSpeaker(state, speakerId)
  return tasks.length === 0 ? 0 : Math.round(tasks.filter((task) => task.completedAt).length / tasks.length * 100)
}

export function selectOverdueTasks(state: AppState, now = new Date().toISOString()): OnboardingTask[] {
  return state.tasks.filter((task) => !task.completedAt && Date.parse(task.dueAt) < Date.parse(now))
}

export function selectAcceptedSubmissions(state: AppState): Submission[] {
  return state.submissions.filter((submission) => submission.lifecycle !== 'draft' && submission.status === 'accepted')
}

export function selectUnscheduledSubmissions(state: AppState): Submission[] {
  const scheduledIds = new Set(state.sessions.map((session) => session.submissionId))
  return selectAcceptedSubmissions(state).filter((submission) => !scheduledIds.has(submission.id))
}

export function selectPublishedSessions(state: AppState) {
  return state.sessions.filter((session) => session.published).sort((left, right) => left.startAt.localeCompare(right.startAt))
}

export function selectPublicSpeakers(state: AppState): Speaker[] {
  const publishedSubmissionIds = new Set(selectPublishedSessions(state).map((session) => session.submissionId))
  const publicSpeakerIds = new Set(state.submissions.filter((submission) => publishedSubmissionIds.has(submission.id)).flatMap((submission) => submission.speakerIds))
  return state.speakers.filter((speaker) => speaker.status === 'confirmed' && publicSpeakerIds.has(speaker.id))
}

export function selectAudienceSpeakerIds(state: AppState, audience: MessageAudience, customIds: Id[] = [], now?: string): Id[] {
  switch (audience) {
    case 'accepted':
      return [...new Set(selectAcceptedSubmissions(state).flatMap((submission) => submission.speakerIds))]
    case 'confirmed':
      return state.speakers.filter((speaker) => speaker.status === 'confirmed').map((speaker) => speaker.id)
    case 'incomplete-onboarding':
      return state.speakers.filter((speaker) => selectOnboardingPercent(state, speaker.id) < 100).map((speaker) => speaker.id)
    case 'overdue-tasks':
      return [...new Set(selectOverdueTasks(state, now).map((task) => task.speakerId))]
    case 'custom':
      return customIds.filter((id) => state.speakers.some((speaker) => speaker.id === id))
  }
}

export function selectDashboardMetrics(state: AppState, now?: string) {
  const completedTasks = state.tasks.filter((task) => task.completedAt).length
  const submitted = state.submissions.filter((submission) => submission.lifecycle !== 'draft')
  return {
    totalSubmissions: submitted.length,
    needsReview: submitted.filter((submission) => submission.status === 'needs-review' || submission.status === 'in-review').length,
    confirmedSpeakers: state.speakers.filter((speaker) => speaker.status === 'confirmed').length,
    acceptedSubmissions: selectAcceptedSubmissions(state).length,
    scheduledSessions: state.sessions.length,
    unscheduledSessions: selectUnscheduledSubmissions(state).length,
    overdueTasks: selectOverdueTasks(state, now).length,
    onboardingPercent: state.tasks.length === 0 ? 0 : Math.round(completedTasks / state.tasks.length * 100),
  }
}
