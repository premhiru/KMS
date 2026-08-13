import { describe, expect, it } from 'vitest'
import { deliverableVersionAssetId, orderedDeliverableVersions, selectedIncompleteSpeakerIds } from './DeliverablesWorkspace'

describe('deliverable reminders', () => {
  it('returns unique speakers only for selected incomplete work', () => {
    const tasks = [
      { id: 'a', speakerId: 'speaker-1' },
      { id: 'b', speakerId: 'speaker-1' },
      { id: 'c', speakerId: 'speaker-2', completedAt: '2026-08-12T00:00:00.000Z' },
    ]
    expect(selectedIncompleteSpeakerIds(tasks, ['a', 'b', 'c'])).toEqual(['speaker-1'])
    expect(selectedIncompleteSpeakerIds(tasks, ['c'])).toEqual([])
  })
})

describe('deliverable file detail', () => {
  it('sorts all retained versions newest first so the first row can be marked latest', () => {
    const task = {
      id: 'task-1',
      assetVersion: 2,
      asset: { id: 'asset-2', name: 'slides-final.pdf', type: 'application/pdf', size: 20, selectedAt: '2026-08-12T10:00:00.000Z' },
      deliverableVersions: [
        { id: 'asset-1', version: 1, asset: { id: 'asset-1', name: 'slides.pdf', type: 'application/pdf', size: 10, selectedAt: '2026-08-11T10:00:00.000Z' }, uploadedAt: '2026-08-11T10:00:00.000Z', uploadedBy: 'Priya Raman' },
        { id: 'asset-2', version: 2, asset: { id: 'asset-2', name: 'slides-final.pdf', type: 'application/pdf', size: 20, selectedAt: '2026-08-12T10:00:00.000Z' }, uploadedAt: '2026-08-12T10:00:00.000Z', uploadedBy: 'Priya Raman' },
      ],
    }
    expect(orderedDeliverableVersions(task).map((version) => version.version)).toEqual([2, 1])
    expect(deliverableVersionAssetId(orderedDeliverableVersions(task)[1])).toBe('asset-1')
  })

  it('adds legacy current-file metadata when no explicit version list exists', () => {
    const versions = orderedDeliverableVersions({ id: 'task-1', assetVersion: 3, asset: { id: 'asset-3', name: 'slides.pdf', type: 'application/pdf', size: 30, selectedAt: '2026-08-12T10:00:00.000Z' } })
    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({ version: 3, id: 'asset-3' })
  })
})
