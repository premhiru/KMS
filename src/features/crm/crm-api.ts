import type { AirtableIntegrationStatus, AirtableSyncRun, CrmDocument, VersionedCrmDocument } from './types'

async function json<T>(response: Response): Promise<T> { const body = await response.json().catch(() => null) as { data?: T; message?: string } | null; if (!response.ok) throw new Error(body?.message || `CRM request failed (${response.status}).`); return (body?.data ?? body) as T }
export class CrmApi {
  private workspaceId: string
  constructor(workspaceId: string) { this.workspaceId = workspaceId }
  private path(suffix = '') { return `/api/workspaces/${encodeURIComponent(this.workspaceId)}/crm${suffix}` }
  get(signal?: AbortSignal) { return fetch(this.path(), { credentials: 'same-origin', signal }).then((response) => json<VersionedCrmDocument>(response)) }
  put(crm: CrmDocument, revision: number) { return fetch(this.path(), { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'if-match': `"${revision}"` }, body: JSON.stringify({ expectedRevision: revision, crm }) }).then((response) => json<VersionedCrmDocument>(response)) }
  addToEvent(contactId: string, eventId: string, revision: number) { return fetch(this.path('/actions/add-to-event'), { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contactId, eventId, expectedRevision: revision }) }).then((response) => json<VersionedCrmDocument>(response)) }
  getAirtableStatus(signal?: AbortSignal) { return fetch(this.path('/integrations/airtable'), { credentials: 'same-origin', signal }).then((response) => json<AirtableIntegrationStatus>(response)) }
  syncAirtable(revision: number) { return fetch(this.path('/integrations/airtable/sync'), { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: revision, idempotencyKey: crypto.randomUUID() }) }).then((response) => json<AirtableSyncRun>(response)) }
}
