# OpenSpeaker Worker schema

The packaged migrations are `drizzle/0001_initial.sql`, `0002_integrations.sql`, `0003_operations.sql`, `0004_automation_scopes.sql`, `0005_cfp_claims.sql`, `0006_crm.sql`, and `0007_reviewer_invitations.sql`. Runtime initialization executes one prepared statement per table/index and records each version in `schema_migrations`.

`workspaces` and `memberships` are the tenant boundary. Production bootstrap and missing-owner repair are restricted to the exact configured owner email received through trusted Sites forwarding; forwarded IDs are persisted for attribution but are not compared with access-account IDs from another namespace. Memberships may carry a nullable expiry for temporary evaluator access; expired rows never authorize a request. Every event, submission, asset, integration, automation, and audit query is workspace/event scoped.

`event_states` stores the validated AppState JSON with an optimistic monotonic revision. `event_state_history` stores committed snapshots, actor, timestamp, and reason. Rollback copies a snapshot to a new revision rather than rewinding history. Normalized `public_submissions` are imported idempotently by source ID and their statuses reconcile in both directions.

`assets` contains D1 metadata while bytes live in R2 under workspace/event-prefixed opaque keys. Authorization is organizer- or matched-event-speaker-scoped; approved resource references explicitly grant download access.

`integration_runs` and `message_deliveries` provide durable provider history. `integration_leases` provides crash recovery and active-attempt exclusion. `integration_object_mappings` stores Accelevents local-to-remote speaker/session IDs.

`automation_runs`, `automation_leases`, and `reminder_deliveries` provide tenant/event-scoped scheduled/manual reminder history with stale-run recovery; retention uses an explicit global scope. `rate_limit_buckets` supplies CFP throttling. `audit_log` records attributed mutations and automation outcomes.

`cfp_claim_tokens` stores only a SHA-256 digest of each short-lived, single-use email-link token. `cfp_claim_sessions` stores only a digest of the opaque session cookie and scopes it to one workspace/event/speaker email. A valid claim takes precedence over ambient hosting identity exclusively inside that event's speaker-portal and proposal mutation handlers, supporting clean link testing in an already signed-in browser; invalid/expired claims fall back to normal hosting identity. These sessions never grant workspace membership or access to general session, state, member, reviewer, audit, integration, or asset routes.

`reviewer_invitation_tokens` and `reviewer_invitation_sessions` apply the same raw-token-free design to reviewer provisioning. An organizer may invite only an email already assigned in that event. The cookie is path-scoped to that event and is consulted only by reviewer queue/review handlers; it grants neither workspace membership nor state, speaker, member, provider, or administrative access. Provider outcomes and message IDs are durable.

`organizer_invitation_tokens` supports hands-off evaluator onboarding. Only an owner can create a bounded batch. The database stores hashes, expiry, requester, and redemption attribution but never raw links. Redemption requires a trusted hosting identity, is atomic and one-time, and creates an expiring organizer membership without changing an existing owner.

`crm_documents` stores one optimistic, revisioned cross-event CRM document per workspace; `crm_history` keeps immutable write snapshots. `crm_integration_runs` durably records Airtable attempts and their idempotency keys, while `crm_airtable_mappings` retains workspace-scoped local-to-remote contact IDs for safe updates and crash reconciliation. Internal notes and activity remain only in D1 and are excluded from the outbound Airtable projection.
