-- One-time email codes that confirm a payout-number change for accounts that
-- sign in with Google/Facebook (no password to re-enter), and as the
-- "forgot my password" alternative for everyone else. Only a hash is stored.
CREATE TABLE IF NOT EXISTS payout_change_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payout_change_codes_user ON payout_change_codes(user_id);
