import { describe, expect, it } from 'vitest'
import type { Submission } from '../../domain'
import { addReviewerToPool, autoDistributeReviewers } from './evaluation-pools'

const at = '2026-08-13T00:00:00.000Z'
const submission = (id: string): Submission => ({
  id,
  title: id,
  abstract: 'A complete proposal abstract.',
  track: 'Platform',
  format: 'Talk',
  durationMinutes: 30,
  speakerIds: [],
  status: 'needs-review',
  tags: [],
  createdAt: at,
  updatedAt: at,
})

describe('round reviewer pools', () => {
  it('normalizes and deduplicates reviewer email addresses', () => {
    const first = addReviewerToPool([], { name: 'Sam Reviewer', email: ' SAM@EXAMPLE.COM ' })
    expect(first).toEqual([{ name: 'Sam Reviewer', email: 'sam@example.com' }])
    expect(addReviewerToPool(first, { name: 'Duplicate', email: 'sam@example.com' })).toBe(first)
  })

  it('round-robins filtered submissions without duplicating existing pairs', () => {
    const reviewers = [{ name: 'Sam', email: 'sam@example.com' }, { name: 'Ari', email: 'ari@example.com' }]
    const existing = [{ id: 'assignment-existing', roundId: 'round-1', submissionId: 'one', reviewerName: 'Sam', reviewerEmail: 'sam@example.com', status: 'assigned' as const, assignedAt: at, updatedAt: at }]
    const result = autoDistributeReviewers('round-1', [submission('one'), submission('two'), submission('three')], reviewers, existing, at)
    expect(result.map((item) => [item.submissionId, item.reviewerEmail])).toEqual([
      ['two', 'ari@example.com'],
      ['three', 'sam@example.com'],
    ])
  })
})
