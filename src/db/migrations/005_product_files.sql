-- The actual deliverable (upload or external link), separate from the
-- public cover image. Storage stays local disk in Phase 1; signed/expiring
-- download URLs are a Phase 2 concern once real payment gates delivery.

CREATE TABLE IF NOT EXISTS product_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('upload','external_link')),
  storage_path TEXT,
  external_url TEXT,
  original_filename TEXT,
  size_bytes INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
