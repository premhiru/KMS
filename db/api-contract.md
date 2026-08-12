# Worker API contract

Responses use `{ "data": ... }` or `{ "error": { "code", "message", "details?", "requestId" } }`. Authenticated routes trust the Sites `oai-authenticated-user-*` headers. `ALLOW_LOCAL_AUTH=true` enables test aliases only. Mutations reject untrusted browser origins.

## Public

- `GET /api/health` returns D1/R2 binding status.
- `GET /api/public/cfp/:workspaceId/:eventSlug` returns public event metadata, `config`, revision, and a privacy-filtered state whose `event.cfp` contains that same server configuration.
- `POST /api/public/cfp/:workspaceId/:eventSlug` accepts a proposal. The server enforces close time, atomic per-email limits, track/format values, enabled category routing, `conditions`/legacy `showWhen` including prior-answer dependencies, visible required questions, and fixed-window rate limits. When enabled routing rules exist, `category` must match one and the server replaces applicant-supplied track/format with the rule's configured values. The server stamps `cfpVersion`; import stamps `origin: "cfp"`.
- `POST /api/public/cfp/:workspaceId/:eventSlug/claim` accepts `{ email, returnUrl }` and always returns `202 { data: { status: "pending" } }` for both matching and non-matching valid emails. Requests are IP/email/event rate limited. When the normalized email belongs to an event speaker or CFP submission and Resend is configured, the server sends a same-origin URL containing a cryptographically random `claimToken` query parameter. Raw tokens are never stored.
- `GET /api/public/cfp/:workspaceId/:eventSlug/claim?token=...` atomically consumes a valid unexpired token once and returns `{ data: { claimed: true, eventId } }`. Invalid, expired, replayed, and wrong-event tokens all return the same `401 CLAIM_INVALID_OR_EXPIRED` response.

Successful claim redemption sets `openspeaker_cfp_claim=<opaque>` with `Secure; HttpOnly; SameSite=Lax`, a configurable seven-day default `Max-Age`, and path `/api/workspaces/:workspaceId/events/:eventId/speaker-portal`. Only that exact event's speaker-portal GET/PATCH and nested proposal POST/PATCH handlers consult the cookie. It does not create workspace membership and is ignored by `/session`, state, member, reviewer, asset, audit, integration, reminder, and administrative routes.
- `GET /api/public/events/:workspaceId/:eventSlug/state` returns published sessions, their accepted submissions, confirmed speakers, and privacy-safe event fields only.
- `GET|HEAD /api/public/events/:workspaceId/:eventSlug/feeds/program.json` returns the live published program as `application/json`.
- `GET|HEAD /api/public/events/:workspaceId/:eventSlug/feeds/program.xml` returns the same program as UTF-8 `application/xml` with escaped field content.
- `GET|HEAD /api/public/events/:workspaceId/:eventSlug/feeds/program.ics` returns an RFC 5545 `text/calendar` subscription using stable event/session UIDs, `METHOD:PUBLISH`, start/end, location, description, speakers, track, and format. The shorter `/feed.json|xml|ics` aliases are also accepted.

Program feeds are anonymous, expose only accepted submissions attached to published sessions and their confirmed public speakers, omit emails/reviews/tasks/source payloads, support exact `track`, `format`, and `room` query filters, and send `Access-Control-Allow-Origin: *`, a five-minute public cache with stale revalidation, revision-derived ETags, and `304 Not Modified` handling.
- `GET /api/public/events/:workspaceId/:eventSlug/speakers/:speakerId/headshot` returns an inline, short-cache image only when that public speaker's headshot task remains completed and approved and its event-scoped R2 asset is JPEG, PNG, or WebP.

## Workspace and state

- `GET /api/workspaces/:workspaceId/session` returns `{ user, role }` for a member.
- `GET /api/workspaces/:workspaceId/events` is organizer-only and returns `{ events: [{ id, name, slug, startAt, endAt, revision, createdAt, updatedAt }] }`.
- `POST /api/workspaces/:workspaceId/events` is organizer-only. Body: `{ state: AppState }`. `state.event.id/name/slug` identify the new event; the server rejects duplicate workspace IDs/slugs and atomically creates event state and its first history snapshot at revision 1.
- `GET /api/workspaces/:workspaceId/events/:eventId/state` is organizer-only and returns `{ event, revision, state, ingestion, updatedAt }`. It deterministically imports/reconciles normalized CFP records.
- `PUT /api/workspaces/:workspaceId/events/:eventId/state` is organizer-only. Body: `{ expectedRevision, event: { name, slug, cfpOpen, cfpConfig }, state }`. The Worker validates AppState schema 1, required entities, enums, dates, bounds, unique IDs, and references. Stale writes return `409 REVISION_CONFLICT`; CFP statuses reconcile transactionally.
- `GET /api/workspaces/:workspaceId/events/:eventId/state/history` lists up to 200 durable revisions.
- `GET /api/workspaces/:workspaceId/events/:eventId/state/history/:revision` returns a complete historical AppState snapshot.
- `POST /api/workspaces/:workspaceId/events/:eventId/state/rollback` accepts `{ expectedRevision, targetRevision, reason? }` and restores that snapshot as a new revision.
- Submission/member/audit routes retain their existing paths. General submission listing is organizer-only; reviewers use the scoped queue.

Only the exact `BOOTSTRAP_OWNER_EMAIL` may initialize a production workspace or repair its missing owner membership. The email comes from trusted Sites forwarding headers and is the canonical identity because access-account IDs and forwarded user IDs can use different namespaces. `BOOTSTRAP_OWNER_ID` is optional metadata and is not an authorization match; no other email is auto-enrolled.

## Reviewer and speaker scopes

- `GET .../reviewer-queue` returns only assignments matching the authenticated email. Blind rounds redact speaker/source data.
- `POST .../reviews` accepts only the reviewer's assigned submission with optimistic revision control.
- Review bodies may include `{ scores, answers, note }`. Numeric `rating` criteria remain in `scores`; `select` and `text` values are stored in `answers`. Required fields, score ranges, configured dropdown options, and text length are enforced from the assigned round's rubric.
- `GET|PATCH .../speaker-portal` requires a hosting email matching a speaker in that event. It returns/updates only that speaker, their submissions/tasks/sessions/assets, and approved resource pages/files.
- Speaker task updates accept `{ id, completed?, assetId?, newComment?: { id, body, createdAt } }`. A newly selected event-owned asset appends an immutable server-built `deliverableVersions` entry without deleting earlier versions. Comment author name/role are derived from the verified speaker identity; duplicate comment IDs replay idempotently and conflicting reuse is rejected.
- `POST .../speaker-portal/submissions` and `PATCH .../speaker-portal/submissions/:submissionId` accept `{ expectedRevision, action: "save-draft"|"submit", title?, abstract?, track?, format?, durationMinutes?, tags?, customAnswers? }`. They require a verified-email speaker match, enforce optimistic revision and event ownership, and reject writes after the CFP close time or after an organizer decision. Drafts may be incomplete; submission requires complete core fields.

Successful anonymous CFP submission attempts an idempotent Resend confirmation when `RESEND_API_KEY` and `EMAIL_FROM` are configured. The receipt includes `confirmationEmail: { status: "sent"|"failed"|"skipped", ... }`; proposal acceptance is not rolled back if an external email provider is unavailable.

## Assets

- `POST .../assets` is available to organizers or a hosting identity matching a speaker in that event. Raw bytes require `X-File-Name` and allowed `Content-Type`; images, PDF, PPT/PPTX, DOC/DOCX, and UTF-8 plain text are signature/content checked. Per-file, user/event, total-event, and count quotas apply.
- `GET .../assets/:assetId` allows organizers, the uploader, or a matched event speaker reading an asset referenced by an approved speaker resource.
- `DELETE .../assets/:assetId` requires organizer access.

## Integrations

- `GET .../integrations` returns `{ configured, runs, deliveries, mappings }`, including lease attempts and native Accelevents object mappings.
- `POST .../integrations/email/send` accepts `{ idempotencyKey, replyTo?, messages: [{ speakerId, subject, text?, html?, attachment? }] }`. Resend recipients come from event speakers. An attachment request `{ filename, type: "text/calendar" }` is regenerated server-side from only that speaker's published accepted sessions as an RFC 5545 `METHOD:REQUEST`; applicant/client calendar content is never trusted. Due reminders receive the same scoped invite when sessions exist. Durable recipient rows plus provider keys make recovery resumable.
- `POST .../integrations/accelevents/sync` accepts `{ idempotencyKey }`. It consumes `state.event.accelevents`, then calls the native host API using the `Key` header and event URL. Speakers are created/updated first; durable remote IDs are attached to created/updated sessions.

Active integrations hold renewable leases. A concurrent duplicate returns `409 INTEGRATION_IN_PROGRESS`; an expired lease can be claimed; terminal retries replay the stored result. Provider calls time out.

## Cross-event CRM and Airtable

All CRM routes require workspace `organizer` or `owner` membership. CRM records never appear in public, reviewer, or speaker projections.

- `GET /api/workspaces/:workspaceId/crm` returns `{ data: { crm, revision } }` with a private ETag. The first read creates revision 1 by normalizing speakers from every persisted event by email and retaining event/session links.
- `PUT /api/workspaces/:workspaceId/crm` accepts `If-Match: "<revision>"` and `{ expectedRevision, crm }`. It validates the complete bounded document, records history/audit, and returns `{ data: { crm, revision } }`. Stale writes return `409 REVISION_CONFLICT`.
- `POST /api/workspaces/:workspaceId/crm/actions/add-to-event` accepts `{ contactId, eventId, expectedRevision }`. It creates or reconciles a speaker in that workspace's event, appends the CRM event link and activity, and returns `{ data: { crm, revision, eventRevision, idempotent } }`. A repeated already-linked action does not create a duplicate or advance revisions.
- `GET /api/workspaces/:workspaceId/crm/integrations/airtable` returns `{ data: { configured, mappedContacts, lastRun? } }`; `lastRun` contains `{ runId, status, synced?, replayed?, error?, completedAt? }` and never provider credentials.
- `POST /api/workspaces/:workspaceId/crm/integrations/airtable/sync` accepts `{ expectedRevision, idempotencyKey }`. D1 remains authoritative. A successful or durably failed attempt returns HTTP 200 with `{ data: { runId, status: "succeeded"|"failed", synced: { contacts }, replayed, error?, completedAt } }`; missing configuration returns `503 PROVIDER_NOT_CONFIGURED`. Terminal keys replay their stored receipt, active keys return `409`, and stale runs can resume. Before any create, the adapter reconciles by `OpenSpeaker Contact ID`, preventing duplicate remote records after a crash.

The outbound Airtable table defaults to `Speaker CRM Contacts` (`AIRTABLE_TABLE_NAME` may override it). Expected fields are `OpenSpeaker Contact ID` (primary text), `First Name`, `Last Name`, `Email`, `Company`, `Job Title`, `Biography`, `LinkedIn URL`, `Twitter URL`, `Travel Preferences`, `Tags`, `Custom Fields JSON`, `Event Links JSON`, and `Updated At`. This is a one-way D1-to-Airtable mirror. Internal notes, activity, pipeline rationales/history, segments, campaign bodies/previews, audit data, and tokens are deliberately excluded.

## Reminders and maintenance

- `GET .../reminders` returns `{ configured, schedules, runs, deliveries }`.
- `POST .../reminders/run` accepts `{ at?, idempotencyKey? }`, evaluates enabled schedules against incomplete/due tasks, personalizes the enabled template, and delivers through Resend once per schedule/task/cadence bucket. Keys are workspace/event scoped and expired leases allow stale `running` runs to resume.
- `POST /api/internal/maintenance` requires `Authorization: Bearer $CRON_SECRET`; body `{ at? }`. It performs retention cleanup and due processing for persisted events. It returns `502` for reminder failures and `503` when reminders are due but Resend is unconfigured.
- The Worker exports `scheduled(controller, env, ctx)` with identical behavior and rejects failed runs for platform observability. `.github/workflows/maintenance.yml` is the portable 15-minute HTTP fallback.

## Runtime configuration

- Core: `DB`, `FILES`, `ALLOWED_ORIGINS`, `ALLOW_LOCAL_AUTH`, canonical `BOOTSTRAP_OWNER_EMAIL`, optional informational `BOOTSTRAP_OWNER_ID`.
- CFP: `CFP_RATE_LIMIT`, `CFP_RATE_WINDOW_SECONDS`.
- CFP proposal access: `CFP_CLAIM_RATE_LIMIT` (default 5), `CFP_CLAIM_RATE_WINDOW_SECONDS` (default 900), `CFP_CLAIM_TOKEN_SECONDS` (default 900, bounded 300–3600), `CFP_CLAIM_SESSION_SECONDS` (default 604800, bounded 3600–2592000). Claim email requires `RESEND_API_KEY` and `EMAIL_FROM`; responses remain generic when the provider is absent or fails.
- Assets: `MAX_ASSET_BYTES` (10 MB), `MAX_USER_EVENT_ASSET_BYTES` (50 MB), `MAX_EVENT_ASSET_BYTES` (250 MB), `MAX_EVENT_ASSET_COUNT` (2000), `ALLOWED_ASSET_TYPES`.
- Email: `RESEND_API_KEY`, `EMAIL_FROM`.
- Accelevents: `ACCELEVENTS_API_KEY`, `ACCELEVENTS_EVENT_URL` (slug), optional HTTPS `ACCELEVENTS_API_BASE_URL` (defaults to `https://api.accelevents.com`).
- Airtable: `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` (an `app...` ID), optional `AIRTABLE_TABLE_NAME` (defaults to `Speaker CRM Contacts`). The token needs record read/write access only to the configured base and is never returned or audited.
- Operations: `PROVIDER_TIMEOUT_MS`, `INTEGRATION_LEASE_MS`, `AUTOMATION_LEASE_SECONDS`, `CRON_SECRET`, `CFP_RETENTION_DAYS`, `INTEGRATION_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS`, `AUTOMATION_RETENTION_DAYS`, `RATE_LIMIT_RETENTION_DAYS`.

See `db/operations.md` for backup, restore, retention, and monitoring guidance.
