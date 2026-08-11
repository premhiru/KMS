import { describe, expect, it } from 'vitest'
import { createSeedState } from '../domain/seed'
import type { ReviewerMutationReceipt } from '../services'
import { applyReviewerReceipt } from './review-reconcile'

function reviewReceipt(status: 'completed' | 'abstained'): ReviewerMutationReceipt {
  const state = createSeedState()
  const assignment = state.evaluationAssignments?.find((item) => item.id === 'assignment-tools-sarah')
  if (!assignment) throw new Error('Expected reviewer assignment fixture.')
  return {
    revision: 2,
    assignment: { ...assignment, status, updatedAt: '2026-08-11T04:00:00.000Z' },
    review: {
      id: 'review-tools-sarah',
      assignmentId: assignment.id,
      roundId: assignment.roundId,
      submissionId: assignment.submissionId,
      reviewerName: assignment.reviewerName,
      scores: { relevance: 4, originality: 4, clarity: 5, 'speaker-fit': 4 },
      note: 'Receipt-backed review',
      updatedAt: '2026-08-11T04:00:00.000Z',
    },
  }
}

describe('reviewer mutation projection', () => {
  it('projects a successful receipt without requiring a follow-up queue request', () => {
    const projected = applyReviewerReceipt(createSeedState(), reviewReceipt('completed'))

    expect(projected.reviews.find((review) => review.id === 'review-tools-sarah')?.note).toBe('Receipt-backed review')
    expect(projected.evaluationAssignments?.find((assignment) => assignment.id === 'assignment-tools-sarah')?.status).toBe('completed')
  })

  it('removes a previous review when the authoritative receipt abstains the assignment', () => {
    const completed = applyReviewerReceipt(createSeedState(), reviewReceipt('completed'))
    const abstained = applyReviewerReceipt(completed, reviewReceipt('abstained'))

    expect(abstained.reviews.some((review) => review.assignmentId === 'assignment-tools-sarah')).toBe(false)
    expect(abstained.evaluationAssignments?.find((assignment) => assignment.id === 'assignment-tools-sarah')?.status).toBe('abstained')
  })
})
