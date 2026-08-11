-- Additive compatibility migration. Application code prefixes stored keys so
-- databases retaining the legacy global UNIQUE constraint remain tenant-safe.
ALTER TABLE automation_runs ADD COLUMN scope_key TEXT NOT NULL DEFAULT 'global';

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_runs_scope_key
  ON automation_runs(scope_key, kind, idempotency_key);

CREATE TABLE IF NOT EXISTS automation_leases (
  run_id TEXT PRIMARY KEY REFERENCES automation_runs(id) ON DELETE CASCADE,
  lease_token TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_leases_expiry
  ON automation_leases(lease_expires_at);
