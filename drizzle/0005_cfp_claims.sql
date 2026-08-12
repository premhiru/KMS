CREATE TABLE IF NOT EXISTS cfp_claim_tokens (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  speaker_email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  consume_nonce TEXT,
  requested_ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cfp_claim_tokens_event_email
  ON cfp_claim_tokens(workspace_id, event_id, speaker_email, created_at DESC);

CREATE TABLE IF NOT EXISTS cfp_claim_sessions (
  session_hash TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL UNIQUE REFERENCES cfp_claim_tokens(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  speaker_email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cfp_claim_sessions_event_expiry
  ON cfp_claim_sessions(workspace_id, event_id, expires_at);
