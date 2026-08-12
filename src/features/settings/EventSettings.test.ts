import { describe, expect, it } from 'vitest'
import type { ResourcePage } from '../../domain'
import { createResourceRevision, resourceContentChanged, resourceContentDraft } from './EventSettings'

const resource: ResourcePage = { id: 'resource-1', title: 'Guide', body: 'Original', version: 4, approvalStatus: 'approved' }

describe('speaker wiki revisions', () => {
  it('keeps edits in a draft until one explicit revision is created', () => {
    const draft = { ...resourceContentDraft(resource), body: 'Edited many times' }
    expect(resourceContentChanged(resource, draft)).toBe(true)

    const revision = createResourceRevision(resource, draft, '2026-08-12T00:00:00.000Z')
    expect(revision).toMatchObject({ body: 'Edited many times', version: 5, approvalStatus: 'draft', updatedAt: '2026-08-12T00:00:00.000Z' })
    expect(resource.version).toBe(4)
  })

  it('treats an unchanged draft as saved', () => expect(resourceContentChanged(resource, resourceContentDraft(resource))).toBe(false))
})
