# Speaker CRM integration contract

`CrmWorkspace` is an organization-level feature. It deliberately has no browser-storage fallback because CRM notes, event links, campaigns, segments, and pipeline history are shared business records.

Authenticated owner/organizer routes:

- `GET /api/workspaces/:workspaceId/crm` → `{ data: { crm: CrmDocument, revision: number } }`
- `PUT /api/workspaces/:workspaceId/crm` with `If-Match: "<revision>"` and `{ expectedRevision, crm }` → the next versioned document. Reject stale revisions with the API's normal conflict response.
- `POST /api/workspaces/:workspaceId/crm/actions/add-to-event` with `{ contactId, eventId, expectedRevision }` → the next versioned document after creating or reconciling the target event speaker and adding the resulting `eventLinks` entry. Repeating the same action must be idempotent.
- `GET /api/workspaces/:workspaceId/crm/integrations/airtable` → `{ data: { configured, lastRun? } }`.
- `POST /api/workspaces/:workspaceId/crm/integrations/airtable/sync` with `{ expectedRevision, idempotencyKey }` → a durable run receipt. Airtable is optional; provider failure must not roll back or corrupt D1 CRM data.

The server should bootstrap contacts by normalized email from every event's current speakers, retaining each event/session link. Writes must be workspace-scoped, validate every ID/string/array length, cap document size, audit actor/action, and never expose internal notes through public or speaker-role projections.
