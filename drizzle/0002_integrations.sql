CREATE TABLE IF NOT EXISTS integration_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('resend','accelevents')),
  action TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','sent','succeeded','partial','failed')),
  request_json TEXT NOT NULL DEFAULT '{}',
  response_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  started_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (workspace_id, event_id, provider, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_integration_runs_event_created ON integration_runs(workspace_id, event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS message_deliveries (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES integration_runs(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  recipient_speaker_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued','sent','failed')),
  error_message TEXT,
  requested_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, event_id, idempotency_key, recipient_email)
);

CREATE INDEX IF NOT EXISTS idx_message_deliveries_event_created ON message_deliveries(workspace_id, event_id, created_at DESC);
