import type { AppState } from '../domain/types'
import type { ReviewerMutationReceipt } from '../services'

/** Projects an authoritative mutation receipt so a failed follow-up refresh cannot create a false save failure. */
export function applyReviewerReceipt(state: AppState, receipt: ReviewerMutationReceipt): AppState {
  const reviewsWithoutAssignment = state.reviews.filter((review) => review.id !== receipt.review.id && review.assignmentId !== receipt.assignment.id)
  const reviews = receipt.assignment.status === 'completed' ? [...reviewsWithoutAssignment, receipt.review] : reviewsWithoutAssignment
  const currentAssignments = state.evaluationAssignments ?? []
  const evaluationAssignments = currentAssignments.some((assignment) => assignment.id === receipt.assignment.id)
    ? currentAssignments.map((assignment) => assignment.id === receipt.assignment.id ? receipt.assignment : assignment)
    : [...currentAssignments, receipt.assignment]
  return { ...state, reviews, evaluationAssignments, lastUpdatedAt: receipt.assignment.updatedAt }
}
