# Production operations

## Hosted configuration

D1 state and R2 files work without third-party credentials. Production email/reminders, Accelevents synchronization, bootstrap, and the HTTP maintenance trigger require the secrets listed in `api-contract.md`. Keep them server-side.

Configure GitHub secret `OPENSPEAKER_CRON_SECRET` for `.github/workflows/maintenance.yml`; the production URL is fixed in that workflow. If the host registers the Worker `scheduled` handler directly, the HTTP fallback is optional. A private outer Sites policy may block the HTTP fallback before it reaches `CRON_SECRET`; use the native trigger or deliberately configure deployment access.

## Backup and recovery

- Event AppState revisions are continuously stored in `event_state_history`; list/export them through the history endpoints. Rollback always creates a new revision.
- History is not a complete D1/R2 backup. Before migrations and at least daily, use the hosting provider's D1 export/backup and R2 replication/export facilities. Retain encrypted copies outside the deployment account and run quarterly restores into non-production.
- Restore D1 and R2 from the same backup window. Compare `assets.object_key` with R2 inventory, then verify health, state history, reminder history, and integration mappings before reopening writes.

## Retention

Defaults are 2 days for rate-limit buckets, 730 days for closed normalized CFP submissions, 365 days for integration/automation history, and 730 days for audit entries. Configuration can increase them; conservative minimums prevent accidental short retention. Deleting normalized CFP rows does not erase proposals intentionally retained in AppState/history, so privacy deletion requires an organizer state update and normal backup expiration.

## Monitoring

Alert on Worker 5xx rates, provider timeouts, lost leases, failed/partial runs, storage quota errors, and absence of successful maintenance for 30 minutes. `/api/health` proves binding/database access, not provider credentials; use integration/reminder status for provider monitoring.
