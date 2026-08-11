import { describe, expect, it } from 'vitest'
import type { AuditEntry, WorkspaceMember } from '../../services'
import { auditMetadataLabel, filterAudit, filterMembers } from './admin-utils'

const members: WorkspaceMember[] = [
  { id: 'hosting-user-1', email: 'owner@example.com', name: 'Priya Owner', role: 'owner', createdAt: '2026-08-11T00:00:00Z' },
  { id: 'hosting-user-2', email: 'reviewer@example.com', name: 'Ravi Reviewer', role: 'reviewer', createdAt: '2026-08-11T00:00:00Z' },
]

const audit: AuditEntry[] = [{ id: 'audit-1', actorUserId: 'hosting-user-1', action: 'member.role.updated', entityType: 'workspace_member', entityId: 'hosting-user-2', metadata: { role: 'reviewer' }, requestId: 'request-123', createdAt: '2026-08-11T00:00:00Z' }]

describe('admin workspace filtering', () => {
  it('finds members by hosting identity, email, and role', () => {
    expect(filterMembers(members, 'HOSTING-USER-2')).toEqual([members[1]])
    expect(filterMembers(members, 'owner@example')).toEqual([members[0]])
    expect(filterMembers(members, 'reviewer')).toEqual([members[1]])
  })

  it('searches audit actors, requests, actions, and metadata', () => {
    expect(filterAudit(audit, 'request-123')).toHaveLength(1)
    expect(filterAudit(audit, 'member.role')).toHaveLength(1)
    expect(filterAudit(audit, 'speaker')).toHaveLength(0)
  })

  it('formats audit metadata without exposing raw object coercion', () => {
    expect(auditMetadataLabel({ role: 'reviewer', count: 2 })).toBe('role: reviewer · count: 2')
    expect(auditMetadataLabel({})).toBe('No additional details')
  })
})
