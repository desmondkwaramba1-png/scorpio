-- Link creators to a logged-in user, add the public handle (/@handle) and
-- payout details. SQLite can't add a UNIQUE column or change constraints
-- via ALTER TABLE, so this rebuilds the table and copies existing rows
-- across by id (ids are preserved, so products.creator_id keeps resolving).

CREATE TABLE creators_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  handle TEXT,
  name TEXT NOT NULL,
  email TEXT,
  bio TEXT,
  what_selling TEXT,
  who_for TEXT,
  avatar_path TEXT,
  payout_ecocash_number TEXT,
  payout_bank_details TEXT,
  verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO creators_new (id, name, email, bio, what_selling, who_for, avatar_path, verified, created_at)
SELECT id, name, email, bio, what_selling, who_for, avatar_path, verified, created_at FROM creators;

DROP TABLE creators;
ALTER TABLE creators_new RENAME TO creators;

CREATE UNIQUE INDEX IF NOT EXISTS idx_creators_handle ON creators(handle);
CREATE UNIQUE INDEX IF NOT EXISTS idx_creators_user_id ON creators(user_id);
