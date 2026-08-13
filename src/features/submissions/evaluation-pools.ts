import { createId } from '../../core'
import type { EvaluationAssignment, EvaluationReviewer, Id, Submission } from '../../domain'

export function addReviewerToPool(pool: EvaluationReviewer[], reviewer: EvaluationReviewer): EvaluationReviewer[] {
  const email = reviewer.email.trim().toLowerCase()
  if (!email || pool.some((item) => item.email.trim().toLowerCase() === email)) return pool
  return [...pool, { name: reviewer.name.trim(), email }]
}

export function autoDistributeReviewers(roundId: Id, submissions: Submission[], reviewers: EvaluationReviewer[], existing: EvaluationAssignment[], at: string): EvaluationAssignment[] {
  if (reviewers.length === 0) return []
  const existingPairs = new Set(existing.map((item) => `${item.submissionId}:${item.reviewerEmail.trim().toLowerCase()}`))
  return submissions.flatMap((submission, index) => {
    const reviewer = reviewers[index % reviewers.length]
    const email = reviewer.email.trim().toLowerCase()
    if (existingPairs.has(`${submission.id}:${email}`)) return []
    return [{ id: createId('evaluation-assignment'), roundId, submissionId: submission.id, reviewerName: reviewer.name.trim(), reviewerEmail: email, status: 'assigned' as const, assignedAt: at, updatedAt: at }]
  })
}
