# Worker API contract

Responses use `{ "data": ... }` or `{ "error": { "code", "message", "details?", "requestId" } }`. Authenticated routes trust the Sites `oai-authenticated-user-*` headers. `ALLOW_LOCAL_AUTH=true` enables test aliases only. Mutations reject untrusted browser origins.

## Public

- `GET /api/health` returns D1/R2 binding status.
- `GET /api/public/cfp/:workspaceId/:eventSlug` returns public event metadata, `config`, revision, and a privacy-filtered state whose `event.cfp` contains that same server configuration.
- `POST /api/public/cfp/:workspaceId/:eventSlug` accepts a proposal. The server enforces close time, atomic per-email limits, track/format values, enabled category routing, `conditions`/legacy `showWhen` including prior-answer dependencies, visible required questions, and fixed-window rate limits. When enabled routing rules exist, `category` must match one and the server replaces applicant-supplied track/format with the rule's configured values. The server stamps `cfpVersion`; import stamps `origin: "cfp"`.
- `GET /api/public/events/:workspaceId/:eventSlug/state` returns published sessions, their accepted submissions, confirmed speakers, and privacy-safe event fields only.
- `GET /api/public/events/:workspaceId/:eventSlug/speakers/:speakerId/headshot` returns an inline, short-cache image only when that public speaker's headshot task remains completed and approved and its event-scoped R2 asset is JPEG, PNG, or WebP.

## Workspace and state

- `GET /api/workspaces/:workspaceId/session` returns `{ user, role }` for a member.
- `GET /api/workspaces/:workspaceId/events/:eventId/state` is organizer-only and returns `{ event, revision, state, ingestion, updatedAt }`. It deterministically imports/reconciles normalized CFP records.
- `PUT /api/workspaces/:workspaceId/events/:eventId/state` is organizer-only. Body: `{ expectedRevision, event: { name, slug, cfpOpen, cfpConfig }, state }`. The Worker validates AppState schema 1, required entities, enums, dates, bounds, unique IDs, and references. Stale writes return `409 REVISION_CONFLICT`; CFP statuses reconcile transactionally.
- `GET /api/workspaces/:workspaceId/events/:eventId/state/history` lists up to 200 durable revisions.
- `GET /api/workspaces/:workspaceId/events/:eventId/state/history/:revision` returns a complete historical AppState snapshot.
- `POST /api/workspaces/:workspaceId/events/:eventId/state/rollback` accepts `{ expectedRevision, targetRevision, reason? }` and restores that snapshot as a new revision.
- Submission/member/audit routes retain their existing paths. General submission listing is organizer-only; reviewers use the scoped queue.

Only `BOOTSTRAP_OWNER_ID` plus `BOOTSTRAP_OWNER_EMAIL` may initialize a production workspace. If that exact configured identity reaches an existing workspace whose membership is missing, the Worker repairs its owner membership; no other identity is auto-enrolled.

## Reviewer and speaker scopes

- `GET .../reviewer-queue` returns only assignments matching the authenticated email. Blind rounds redact speaker/source data.
- `POST .../reviews` accepts only the reviewer's assigned submission with optimistic revision control.
- `GET|PATCH .../speaker-portal` requires a hosting email matching a speaker in that event. It returns/updates only that speaker, their submissions/tasks/sessions/assets, and approved resource pages/files.

## Assets

- `POST .../assets` is available to organizers or a hosting identity matching a speaker in that event. Raw bytes require `X-File-Name` and allowed `Content-Type`; images, PDF, PPT/PPTX, DOC/DOCX, and UTF-8 plain text are signature/content checked. Per-file, user/event, total-event, and count quotas apply.
- `GET .../assets/:assetId` allows organizers, the uploader, or a matched event speaker reading an asset referenced by an approved speaker resource.
- `DELETE .../assets/:assetId` requires organizer access.

## Integrations

- `GET .../integrations` returns `{ configured, runs, deliveries, mappings }`, including lease attempts and native Accelevents object mappings.
- `POST .../integrations/email/send` accepts `{ idempotencyKey, replyTo?, messages: [{ speakerId, subject, text?, html?, attachment? }] }`. Resend recipients come from event speakers. An attachment request `{ filename, type: "text/calendar" }` is regenerated server-side from only that speaker's published accepted sessions as an RFC 5545 `METHOD:REQUEST`; applicant/client calendar content is never trusted. Due reminders receive the same scoped invite when sessions exist. Durable recipient rows plus provider keys make recovery resumable.
- `POST .../integrations/accelevents/sync` accepts `{ idempotencyKey }`. It consumes `state.event.accelevents`, then calls the native host API using the `Key` header and event URL. Speakers are created/updated first; durable remote IDs are attached to created/updated sessions.

Active integrations hold renewable leases. A concurrent duplicate returns `409 INTEGRATION_IN_PROGRESS`; an expired lease can be claimed; terminal retries replay the stored result. Provider calls time out.

## Reminders and maintenance

- `GET .../reminders` returns `{ configured, schedules, runs, deliveries }`.
- `POST .../reminders/run` accepts `{ at?, idempotencyKey? }`, evaluates enabled schedules against incomplete/due tasks, personalizes the enabled template, and delivers through Resend once per schedule/task/cadence bucket. Keys are workspace/event scoped and expired leases allow stale `running` runs to resume.
- `POST /api/internal/maintenance` requires `Authorization: Bearer $CRON_SECRET`; body `{ at? }`. It performs retention cleanup and due processing for persisted events. It returns `502` for reminder failures and `503` when reminders are due but Resend is unconfigured.
- The Worker exports `scheduled(controller, env, ctx)` with identical behavior and rejects failed runs for platform observability. `.github/workflows/maintenance.yml` is the portable 15-minute HTTP fallback.

## Runtime configuration

- Core: `DB`, `FILES`, `ALLOWED_ORIGINS`, `ALLOW_LOCAL_AUTH`, `BOOTSTRAP_OWNER_ID`, `BOOTSTRAP_OWNER_EMAIL`.
- CFP: `CFP_RATE_LIMIT`, `CFP_RATE_WINDOW_SECONDS`.
- Assets: `MAX_ASSET_BYTES` (10 MB), `MAX_USER_EVENT_ASSET_BYTES` (50 MB), `MAX_EVENT_ASSET_BYTES` (250 MB), `MAX_EVENT_ASSET_COUNT` (2000), `ALLOWED_ASSET_TYPES`.
- Email: `RESEND_API_KEY`, `EMAIL_FROM`.
- Accelevents: `ACCELEVENTS_API_KEY`, `ACCELEVENTS_EVENT_URL` (slug), optional HTTPS `ACCELEVENTS_API_BASE_URL` (defaults to `https://api.accelevents.com`).
- Operations: `PROVIDER_TIMEOUT_MS`, `INTEGRATION_LEASE_MS`, `AUTOMATION_LEASE_SECONDS`, `CRON_SECRET`, `CFP_RETENTION_DAYS`, `INTEGRATION_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS`, `AUTOMATION_RETENTION_DAYS`, `RATE_LIMIT_RETENTION_DAYS`.

See `db/operations.md` for backup, restore, retention, and monitoring guidance.
