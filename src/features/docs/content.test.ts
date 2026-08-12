import { describe, expect, it } from 'vitest'
import { docsSections, examples } from './content'

describe('documentation content', () => {
  it('has stable unique routes for every documented product area', () => {
    expect(new Set(docsSections.map((section) => section.id)).size).toBe(docsSections.length)
    expect(docsSections.map((section) => section.id)).toEqual(expect.arrayContaining(['quickstart', 'cfp', 'reviews', 'speaker-portal', 'agenda-public', 'communications', 'crm-airtable', 'deployment', 'errors']))
  })

  it('uses placeholders instead of provider credentials', () => {
    const serialized = JSON.stringify(examples)
    expect(serialized).not.toMatch(/re_[A-Za-z0-9]{12,}/)
    expect(serialized).not.toMatch(/pat[A-Za-z0-9._-]{20,}/)
    expect(serialized).toContain('workspace-demo')
  })

  it('documents canonical public and revisioned API paths', () => {
    expect(examples.cfpCurl).toContain('/api/public/cfp/workspace-demo/devflow-2027')
    expect(examples.stateCurl).toContain('/events/event-devflow/state')
    expect(examples.updateStateCurl).toContain('If-Match')
    expect(examples.emailCurl).toContain('text/calendar')
  })
})
