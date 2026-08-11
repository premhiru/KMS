import { reviewAverage } from '../domain/rules'
import type { AppState, Id, MessageAudience, OnboardingTask, Speaker, Submission } from '../domain/types'

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
  return state.submissions.filter((submission) => submission.status === 'accepted')
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
  return {
    totalSubmissions: state.submissions.length,
    needsReview: state.submissions.filter((submission) => submission.status === 'needs-review' || submission.status === 'in-review').length,
    confirmedSpeakers: state.speakers.filter((speaker) => speaker.status === 'confirmed').length,
    acceptedSubmissions: selectAcceptedSubmissions(state).length,
    scheduledSessions: state.sessions.length,
    unscheduledSessions: selectUnscheduledSubmissions(state).length,
    overdueTasks: selectOverdueTasks(state, now).length,
    onboardingPercent: state.tasks.length === 0 ? 0 : Math.round(completedTasks / state.tasks.length * 100),
  }
}
