# OpenSpeaker Worker schema

The canonical migration is `drizzle/0001_initial.sql`. The Worker also carries the same DDL as an array of one-statement prepared queries so a new D1 database initializes idempotently through `DB.batch()`.

## Ownership and tenancy

- `users` identifies a user exclusively from trusted `X-OpenAI-User-*` forwarding headers.
- `workspaces` is the tenant boundary.
- `memberships` grants exactly one role per user/workspace: `owner`, `organizer`, `reviewer`, or `speaker`.
- The first authenticated identity to address a nonexistent workspace atomically bootstraps it and becomes owner. Existing workspaces never auto-enroll later identities.

Every event, submission, asset, and audit entry is scoped to a workspace. Queries include the workspace key even when the entity ID is globally unique.

## Event state

`events` stores public CFP metadata. `event_states` stores the frontend state document and a monotonically increasing `revision`. Writes use an upsert whose update branch includes `WHERE event_states.revision = ?`; a stale writer receives HTTP 409 with the current revision.

Anonymous CFP records remain normalized in `public_submissions`. Authenticated state reads project any source records not already marked by `sourceSubmissionId` into the AppState. Speaker identity is reused by normalized email and otherwise receives a deterministic email-derived ID. This means repeated GETs and subsequent state PUTs cannot duplicate proposals or speakers, while the original source payload and custom answers remain available to reviewers.

## Files

`assets` stores authorization and metadata only. Object bytes live in the `FILES` R2 bucket under a workspace/event-prefixed opaque key. Deleting an asset removes both records.

## Auditing and abuse controls

Mutating authenticated requests and public CFP submissions append `audit_log` records. `rate_limit_buckets` implements fixed-window CFP throttling and is intentionally suitable for replacement with Cloudflare Rate Limiting without changing the HTTP contract.

`integration_runs` provides workspace/event/provider-scoped idempotency and durable success/error history. `message_deliveries` records each personalized Resend recipient independently, including provider message IDs and terminal failure text. Migration `drizzle/0002_integrations.sql` adds both tables and their event/time indexes.
