PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES
  ('0001_initial', CURRENT_TIMESTAMP),
  ('0002_integrations', CURRENT_TIMESTAMP),
  ('0003_operations', CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS event_state_history (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'write',
  PRIMARY KEY (event_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_event_state_history_workspace_event
ON event_state_history(workspace_id, event_id, revision DESC);

CREATE TABLE IF NOT EXISTS integration_leases (
  run_id TEXT PRIMARY KEY REFERENCES integration_runs(id) ON DELETE CASCADE,
  lease_token TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_integration_leases_expiry
ON integration_leases(lease_expires_at);

CREATE TABLE IF NOT EXISTS integration_object_mappings (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'accelevents'),
  object_type TEXT NOT NULL CHECK (object_type IN ('speaker','session')),
  local_id TEXT NOT NULL,
  remote_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, event_id, provider, object_type, local_id)
);

CREATE INDEX IF NOT EXISTS idx_integration_object_remote
ON integration_object_mappings(workspace_id, event_id, provider, object_type, remote_id);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('reminders','retention')),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','succeeded','partial','failed')),
  result_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  started_by TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (kind, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_event_created
ON automation_runs(workspace_id, event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reminder_deliveries (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  schedule_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  speaker_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','sent','failed','skipped')),
  provider_message_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, event_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_reminder_deliveries_event_created
ON reminder_deliveries(workspace_id, event_id, created_at DESC);

PRAGMA optimize;
