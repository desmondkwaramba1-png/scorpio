-- Baseline: the original hand-written schema, made idempotent so this
-- migration is a no-op on databases that already have these tables.

CREATE TABLE IF NOT EXISTS creators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  bio TEXT,
  what_selling TEXT,
  who_for TEXT,
  avatar_path TEXT,
  verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK(type IN ('single','serial')),
  price REAL NOT NULL,
  cover_path TEXT,
  slug TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  issue_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  published_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS buyers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id INTEGER NOT NULL REFERENCES buyers(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  amount REAL NOT NULL,
  payment_reference TEXT,
  payment_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);
