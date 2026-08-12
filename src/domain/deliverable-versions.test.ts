import { describe, expect, it } from 'vitest'
import { appReducer } from '../core/reducer'
import { seedState } from './seed'

describe('deliverable history', () => {
  it('preserves prior file versions and comments', () => {
    const task = seedState.tasks[0]
    const first = appReducer(seedState, { type: 'task/toggle', id: task.id, completed: true, uploadedBy: 'Speaker', at: '2026-01-01T00:00:00.000Z', asset: { id: 'a1', name: 'first.pdf', type: 'application/pdf', size: 1, selectedAt: '2026-01-01T00:00:00.000Z' } })
    const second = appReducer(first, { type: 'task/toggle', id: task.id, completed: true, uploadedBy: 'Organizer', at: '2026-01-02T00:00:00.000Z', asset: { id: 'a2', name: 'second.pdf', type: 'application/pdf', size: 2, selectedAt: '2026-01-02T00:00:00.000Z' } })
    const commented = appReducer(second, { type: 'task/comment', id: task.id, comment: { id: 'c1', authorName: 'Organizer', authorRole: 'organizer', body: 'Ready for review', createdAt: '2026-01-02T00:00:00.000Z' } })
    const result = commented.tasks.find((item) => item.id === task.id)!
    expect(result.deliverableVersions?.map((item) => item.asset.name)).toEqual(['first.pdf', 'second.pdf'])
    expect(result.assetVersion).toBe(2)
    expect(result.comments?.[0].body).toBe('Ready for review')
  })
})
