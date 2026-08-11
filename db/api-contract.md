# Worker API contract

All responses use JSON `{ "data": ... }` or `{ "error": { "code", "message", "details?", "requestId" } }`. Mutating JSON requests use `Content-Type: application/json`. Authenticated routes trust only the hosting platform's `oai-authenticated-user-id`, `oai-authenticated-user-email`, and optional percent-encoded `oai-authenticated-user-full-name` headers. `ALLOW_LOCAL_AUTH=true` enables `x-openai-user-*` aliases for local tests only.

## Public

- `GET /api/health` — D1/R2 binding status.
- `GET /api/public/cfp/:workspaceId/:eventSlug` — open CFP metadata, configuration, revision, and privacy-filtered public state.
- `POST /api/public/cfp/:workspaceId/:eventSlug` — submit `{ title, abstract, speakerName, speakerEmail, track?, format?, category?, customAnswers?, coSpeakers?, consent: true }`. Returns 201. The server enforces `closeAt`, category-to-track routing, configured track/format values, conditionally visible required questions, and `allowMultiple`/`submissionLimit` per normalized speaker email. Fixed-window abuse responses use 429, code `RATE_LIMITED`, `Retry-After`, and `details.retryAfterSeconds`.
- `GET /api/public/events/:workspaceId/:eventSlug/state` — privacy-filtered published event state. It contains only published sessions, accepted submissions attached to them, and confirmed attached speaker public fields.

## Authenticated workspace

- `GET /api/workspaces/:workspaceId/session` — any member. Returns `{ user: { id, email, name }, role }` from trusted hosting identity and membership.
- `GET /api/workspaces/:workspaceId/events/:eventId/state` — organizer or higher. Returns `{ event, revision, state, ingestion, updatedAt }` and `ETag`. Before returning, it deterministically merges public CFP records into the state as `needs-review` submissions and linked speakers. `sourceSubmissionId` and stable email-derived speaker IDs make repeated reads and a later PUT idempotent. Original/custom payload, custom answers, and validated co-speakers are retained on `sourcePayload`, `customAnswers`, and linked speaker records. A missing state returns 404 `EVENT_STATE_NEEDS_SEED` with `{ expectedRevision: 0, canSeed: true }`.
- `PUT /api/workspaces/:workspaceId/events/:eventId/state` — organizer or higher. Body: `{ expectedRevision, event: { name, slug, cfpOpen, cfpConfig }, state }`. A local-only provider seeds with revision `0`; subsequent writes send the last read revision. Stale writes return 409 `REVISION_CONFLICT` with the current revision.
- `GET /api/workspaces/:workspaceId/events/:eventId/submissions` — reviewer or higher; newest first, maximum 500.
- `PATCH /api/workspaces/:workspaceId/events/:eventId/submissions/:submissionId` — organizer or higher; body `{ status }`.
- `POST /api/workspaces/:workspaceId/events/:eventId/assets` — any workspace member. Raw request body, required `X-File-Name` and allowed `Content-Type`; default maximum 10 MB. Returns durable D1 metadata after the R2 write succeeds.
- `GET /api/workspaces/:workspaceId/events/:eventId/assets/:assetId` — organizer or the authenticated uploader; private attachment response.
- `DELETE /api/workspaces/:workspaceId/events/:eventId/assets/:assetId` — organizer or higher.
- `GET /api/workspaces/:workspaceId/members` — organizer or higher.
- `POST /api/workspaces/:workspaceId/members` — owner; body `{ userId, email, name?, role }`.
- `PATCH /api/workspaces/:workspaceId/members/:userId` — owner; body `{ role }`.
- `DELETE /api/workspaces/:workspaceId/members/:userId` — owner.
- `GET /api/workspaces/:workspaceId/audit` — organizer or higher; latest 250 entries.

## Speaker-scoped portal

- `GET /api/workspaces/:workspaceId/events/:eventId/speaker-portal` — an authenticated hosting user whose email matches a speaker in this event. A matching first visit safely claims a `speaker` membership; a nonmatching identity is never enrolled. Returns `{ revision, portal: { event, speaker, submissions, tasks, sessions, resources, assets } }`; it never returns other speakers, reviews, assignments, templates, or private organizer state.
- `PATCH /api/workspaces/:workspaceId/events/:eventId/speaker-portal` — same identity constraint. Body: `{ expectedRevision, profile?, taskUpdates? }`. Profile accepts only `firstName`, `lastName`, `company`, `jobTitle`, `bio`, `pronouns`, invitation `status`, HTTPS `photoUrl`, and valid availability windows. Task updates accept only the speaker's own task IDs and optionally an R2 `assetId` uploaded by the same authenticated user. Returns the same portal projection with the new revision.

## Scoped reviewer write

- `GET /api/workspaces/:workspaceId/events/:eventId/reviewer-queue` — reviewer or higher. Returns only assignments matching the authenticated email, their submissions, the referenced rounds/rubrics/instructions, minimal plan labels, and that reviewer's own reviews. Blind rounds redact speaker IDs, speaker records, source payload, and custom answers. General full-state GET is organizer-only.
- `POST /api/workspaces/:workspaceId/events/:eventId/reviews` — reviewer or higher, additionally requiring the hosting email to match the selected `evaluationAssignment`. Body: `{ expectedRevision, assignmentId, submissionId, review: { scores, note? }, assignmentStatus?, abstain? }`. Only that assignment's review and status/abstain metadata are changed. Cross-reviewer or arbitrary-state writes return `403 REVIEW_ASSIGNMENT_FORBIDDEN`.

## Production integrations

- `GET /api/workspaces/:workspaceId/events/:eventId/integrations` — organizer or higher. Returns `{ configured: { resend, accelevents }, runs, deliveries }` with the latest durable run and message-delivery logs.
- `POST /api/workspaces/:workspaceId/events/:eventId/integrations/email/send` — organizer or higher. Body: `{ idempotencyKey, replyTo?, messages: [{ speakerId, subject, text?, html?, attachment?: { filename, content, type: "text/calendar" } }] }`. Calendar attachments must be `.ics`, include `BEGIN:VCALENDAR`, and remain under 200 KB; the Worker safely base64-encodes them for Resend. Recipient addresses are resolved from speakers in the event state, not trusted from the request. Returns `{ runId, status, replayed, result }`. Uses a per-recipient provider idempotency key and durable queued/sent/failed records. Missing `RESEND_API_KEY` or `EMAIL_FROM` returns `503 PROVIDER_NOT_CONFIGURED`.
- `POST /api/workspaces/:workspaceId/events/:eventId/integrations/accelevents/sync` — organizer or higher. Body: `{ idempotencyKey }`. Sends a one-way event read model containing only accepted submissions, their published sessions, and associated confirmed speakers. Returns `{ runId, status, replayed, result, synced? }`. Missing `ACCELEVENTS_API_URL` or `ACCELEVENTS_API_TOKEN` returns `503 PROVIDER_NOT_CONFIGURED`.

Both action endpoints uniquely scope idempotency to workspace, event, provider, and key. Retries return the prior durable result without calling the provider again.

The first authenticated user to address a nonexistent valid workspace ID creates it and becomes owner. Once the workspace exists, identities without membership receive 403 and are never auto-enrolled.

## Configuration

- `DB`: required D1 binding.
- `FILES`: required R2 binding for asset routes.
- `ALLOWED_ORIGINS`: optional comma-separated cross-origin allowlist; same-origin is always accepted.
- `CFP_RATE_LIMIT`: submissions per window, default `8`.
- `CFP_RATE_WINDOW_SECONDS`: fixed window, default `60`.
- `MAX_ASSET_BYTES`: default `10000000`.
- `ALLOWED_ASSET_TYPES`: optional comma-separated MIME allowlist.
- `ALLOW_LOCAL_AUTH`: set to `true` only in local tests to enable `x-openai-user-*` aliases.
- `RESEND_API_KEY` and `EMAIL_FROM`: Resend email transport.
- `ACCELEVENTS_API_URL` and `ACCELEVENTS_API_TOKEN`: Accelevents one-way sync target and bearer token.
