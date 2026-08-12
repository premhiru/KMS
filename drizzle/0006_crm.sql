CREATE TABLE IF NOT EXISTS crm_documents (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  document_json TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crm_history (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  document_json TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'write',
  PRIMARY KEY (workspace_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_crm_history_workspace_revision
  ON crm_history(workspace_id, revision DESC);

CREATE TABLE IF NOT EXISTS crm_integration_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'airtable'),
  action TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  request_json TEXT NOT NULL DEFAULT '{}',
  response_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  started_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (workspace_id, provider, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_crm_integration_runs_workspace_created
  ON crm_integration_runs(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_airtable_mappings (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL,
  remote_record_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, contact_id),
  UNIQUE (workspace_id, remote_record_id)
);
