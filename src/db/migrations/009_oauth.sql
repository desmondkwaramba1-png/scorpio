-- Google/Facebook sign-in. OAuth signups don't have a phone number up
-- front, but users.phone is NOT NULL from migration 002 — SQLite can't drop
-- a NOT NULL constraint in place, so rebuild the table (migrate.js already
-- runs the whole migration set with foreign_keys off for exactly this).

CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT,
  email_verified_at TEXT,
  phone_verified_at TEXT,
  name TEXT,
  avatar_url TEXT,
  google_id TEXT,
  facebook_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO users_new (id, username, email, phone, password_hash, email_verified_at, phone_verified_at, name, created_at)
  SELECT id, username, email, phone, password_hash, email_verified_at, phone_verified_at, name, created_at FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_facebook_id ON users(facebook_id);
