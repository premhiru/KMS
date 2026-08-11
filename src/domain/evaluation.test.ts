import { describe, expect, it } from 'vitest'
import { appReducer } from '../core/reducer'
import { selectEvaluationRoundProgress, selectReviewerQueue, weightedReviewAverage } from '../core/selectors'
import { createSeedState } from './seed'
import type { EvaluationAdvancement, EvaluationAssignment, EvaluationRound, Review } from './types'

describe('evaluation workflow', () => {
  it('normalizes a configurable weighted rubric to five points', () => {
    const round = {
      rubric: [
        { id: 'impact', label: 'Impact', weight: 75, maxScore: 5 },
        { id: 'risk', label: 'Risk', weight: 25, maxScore: 5 },
      ],
    } satisfies Pick<EvaluationRound, 'rubric'>
    const review = { scores: { impact: 5, risk: 1 } } satisfies Pick<Review, 'scores'>
    expect(weightedReviewAverage(round, review)).toBe(4)
  })

  it('removes speaker identity from a blind reviewer queue', () => {
    const state = createSeedState()
    state.evaluationAssignments = [...(state.evaluationAssignments ?? []), {
      id: 'assignment-final-blind', roundId: 'evaluation-round-final', submissionId: 'submission-tools', reviewerName: 'Blind Reviewer', reviewerEmail: 'blind@example.com', status: 'assigned', assignedAt: state.lastUpdatedAt, updatedAt: state.lastUpdatedAt,
    }]
    const [item] = selectReviewerQueue(state, ' BLIND@example.com ')
    expect(item.blind).toBe(true)
    expect(item.speakers).toEqual([])
    expect(item.submission.speakerIds).toEqual([])
  })

  it('records abstention, removes a linked review, and counts it as terminal progress', () => {
    const state = createSeedState()
    const assignment = state.evaluationAssignments?.[0]
    expect(assignment).toBeDefined()
    const next = appReducer(state, { type: 'evaluation/assignment/abstain', id: assignment!.id, reason: 'Conflict of interest', at: '2026-08-12T00:00:00.000Z' })
    expect(next.evaluationAssignments?.find((item) => item.id === assignment!.id)).toMatchObject({ status: 'abstained', abstainReason: 'Conflict of interest' })
    expect(next.reviews.some((review) => review.assignmentId === assignment!.id)).toBe(false)
    const progress = selectEvaluationRoundProgress(next, assignment!.roundId)
    expect(progress.abstained).toBe(1)
    expect(progress.terminal).toBe(progress.completed + progress.abstained)
  })

  it('advances a submission and creates reviewer assignments idempotently', () => {
    const state = createSeedState()
    const at = '2026-08-13T00:00:00.000Z'
    const advancement: EvaluationAdvancement = { id: 'advance-tools', planId: 'evaluation-plan-program', submissionId: 'submission-tools', fromRoundId: 'evaluation-round-committee', toRoundId: 'evaluation-round-final', advancedAt: at }
    const assignment: EvaluationAssignment = { id: 'assignment-tools-final', roundId: 'evaluation-round-final', submissionId: 'submission-tools', reviewerName: 'Final Reviewer', reviewerEmail: 'final@example.com', status: 'assigned', assignedAt: at, updatedAt: at }
    const once = appReducer(state, { type: 'evaluation/advance', advancement, assignments: [assignment], at })
    const completed = appReducer(once, { type: 'review/upsert', review: { id: 'review-tools-final', roundId: assignment.roundId, assignmentId: assignment.id, submissionId: assignment.submissionId, reviewerName: assignment.reviewerName, scores: { impact: 4 }, note: '', updatedAt: at }, at })
    const twice = appReducer(completed, { type: 'evaluation/advance', advancement: { ...advancement, id: 'duplicate-id' }, assignments: [{ ...assignment, id: 'duplicate-assignment-id' }], at })
    expect(twice.evaluationAdvancements?.filter((item) => item.submissionId === 'submission-tools' && item.toRoundId === 'evaluation-round-final')).toHaveLength(1)
    expect(twice.evaluationAssignments?.filter((item) => item.submissionId === 'submission-tools' && item.roundId === 'evaluation-round-final' && item.reviewerEmail === 'final@example.com')).toHaveLength(1)
    expect(twice.evaluationAssignments?.find((item) => item.id === assignment.id)?.status).toBe('completed')
  })

  it('creates acceptance onboarding tasks exactly once', () => {
    const state = createSeedState()
    const at = '2026-08-14T00:00:00.000Z'
    const once = appReducer(state, { type: 'submission/decide', id: 'submission-tools', status: 'accepted', at })
    const twice = appReducer(once, { type: 'submission/decide', id: 'submission-tools', status: 'accepted', at })
    const speakerId = state.submissions.find((item) => item.id === 'submission-tools')!.speakerIds[0]
    expect(twice.tasks.filter((task) => task.speakerId === speakerId)).toHaveLength(5)
    expect(new Set(twice.tasks.filter((task) => task.speakerId === speakerId).map((task) => task.kind)).size).toBe(5)
  })
})
