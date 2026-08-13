CREATE TABLE IF NOT EXISTS reviewer_invitation_tokens (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reviewer_email TEXT NOT NULL,
  reviewer_name TEXT NOT NULL DEFAULT '',
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  consume_nonce TEXT,
  requested_by TEXT NOT NULL REFERENCES users(id),
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('queued','sent','failed')),
  provider_message_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reviewer_invitation_event_email
  ON reviewer_invitation_tokens(workspace_id,event_id,reviewer_email,created_at DESC);

CREATE TABLE IF NOT EXISTS reviewer_invitation_sessions (
  session_hash TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL UNIQUE REFERENCES reviewer_invitation_tokens(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_email TEXT NOT NULL,
  reviewer_name TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reviewer_invitation_sessions_event_expiry
  ON reviewer_invitation_sessions(workspace_id,event_id,expires_at);
