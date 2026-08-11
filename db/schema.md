# OpenSpeaker Worker schema

The packaged migrations are `drizzle/0001_initial.sql`, `0002_integrations.sql`, `0003_operations.sql`, and `0004_automation_scopes.sql`. Runtime initialization executes one prepared statement per table/index and records each version in `schema_migrations`.

`workspaces` and `memberships` are the tenant boundary. Production bootstrap is restricted to the configured owner identity. Every event, submission, asset, integration, automation, and audit query is workspace/event scoped.

`event_states` stores the validated AppState JSON with an optimistic monotonic revision. `event_state_history` stores committed snapshots, actor, timestamp, and reason. Rollback copies a snapshot to a new revision rather than rewinding history. Normalized `public_submissions` are imported idempotently by source ID and their statuses reconcile in both directions.

`assets` contains D1 metadata while bytes live in R2 under workspace/event-prefixed opaque keys. Authorization is organizer- or matched-event-speaker-scoped; approved resource references explicitly grant download access.

`integration_runs` and `message_deliveries` provide durable provider history. `integration_leases` provides crash recovery and active-attempt exclusion. `integration_object_mappings` stores Accelevents local-to-remote speaker/session IDs.

`automation_runs`, `automation_leases`, and `reminder_deliveries` provide tenant/event-scoped scheduled/manual reminder history with stale-run recovery; retention uses an explicit global scope. `rate_limit_buckets` supplies CFP throttling. `audit_log` records attributed mutations and automation outcomes.
