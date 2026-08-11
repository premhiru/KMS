import type { AuditEntry, WorkspaceMember } from '../../services'

export function adminErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The workspace request failed.'
}

export function filterMembers(members: WorkspaceMember[], query: string): WorkspaceMember[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return members
  return members.filter((member) => `${member.name} ${member.email} ${member.id} ${member.role}`.toLowerCase().includes(needle))
}

export function filterAudit(entries: AuditEntry[], query: string): AuditEntry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return entries
  return entries.filter((entry) => `${entry.action} ${entry.entityType} ${entry.entityId} ${entry.actorUserId ?? 'system'} ${entry.requestId} ${JSON.stringify(entry.metadata)}`.toLowerCase().includes(needle))
}

export function auditMetadataLabel(metadata: Record<string, unknown>): string {
  const pairs = Object.entries(metadata)
  if (pairs.length === 0) return 'No additional details'
  return pairs.map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`).join(' · ')
}
