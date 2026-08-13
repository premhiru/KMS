ALTER TABLE memberships ADD COLUMN expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_memberships_expiry
  ON memberships(workspace_id, expires_at);

CREATE TABLE IF NOT EXISTS organizer_invitation_tokens (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'organizer' CHECK (role = 'organizer'),
  expires_at TEXT NOT NULL,
  grant_expires_at TEXT NOT NULL,
  consumed_at TEXT,
  consumed_by TEXT REFERENCES users(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_organizer_invitation_workspace_expiry
  ON organizer_invitation_tokens(workspace_id, expires_at);
