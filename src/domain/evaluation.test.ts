import { describe, expect, it } from 'vitest'
import { appReducer } from '../core/reducer'
import { reviewResultsToCsv } from '../core/csv'
import { selectDashboardMetrics, selectEligibleSubmissionsForRound, selectEvaluationRoundProgress, selectReviewerProgress, selectReviewerQueue, selectRoundResults, weightedReviewAverage } from '../core/selectors'
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

  it('ignores qualitative criteria in weighting while retaining them in detailed exports', () => {
    const state = createSeedState()
    const round = state.evaluationRounds![0]
    round.rubric.push({ id: 'recommendation', label: 'Recommendation', type: 'select', options: ['Accept', 'Reject'], required: true, weight: 10, maxScore: 5 })
    const review = state.reviews.find((item) => item.roundId === round.id)!
    review.answers = { ...review.scores, recommendation: 'Accept' }
    expect(weightedReviewAverage(round, review)).toBeGreaterThan(0)
    expect(reviewResultsToCsv(state, round.id)).toContain('Recommendation,Accept')
  })

  it('groups reviewer completion and produces sortable result rows', () => {
    const state = createSeedState()
    const roundId = state.evaluationRounds![0].id
    expect(selectReviewerProgress(state, roundId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ reviewerEmail: 'sarah@example.com', assigned: 3, completed: 2, remaining: 1 }),
    ]))
    expect(selectRoundResults(state, roundId).some((row) => row.reviewCount > 0 && row.aggregate !== undefined)).toBe(true)
  })

  it('keeps speaker drafts out of organizer metrics and review eligibility', () => {
    const state = createSeedState()
    const draft = { ...state.submissions[0], id: 'draft-proposal', lifecycle: 'draft' as const }
    state.submissions.push(draft)
    expect(selectDashboardMetrics(state).totalSubmissions).toBe(state.submissions.length - 1)
    expect(selectEligibleSubmissionsForRound(state, state.evaluationRounds![0]).some((submission) => submission.id === draft.id)).toBe(false)
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
    expect(twice.tasks.filter((task) => task.speakerId === speakerId)).toHaveLength(6)
    expect(new Set(twice.tasks.filter((task) => task.speakerId === speakerId).map((task) => task.kind)).size).toBe(6)
  })
})
