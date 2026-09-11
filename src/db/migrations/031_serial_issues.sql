-- Serial products (type='serial', e.g. a weekly publication) could already
-- list issues (see products.js's GET /:slug), but there was no way to
-- actually add one, and the table couldn't represent an issue delivered
-- by external link the way a regular product file can — file_path was
-- NOT NULL with no `kind`/external_url columns. Rebuilt (SQLite can't
-- relax a NOT NULL or add a CHECK via plain ALTER) to match product_files'
-- shape: a `kind`, an optional storage path OR external_url, and the
-- buyer-facing filename. Also adds the product_id index this table never
-- had — every issues lookup was already doing a full scan.

CREATE TABLE issues_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  issue_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'upload' CHECK(kind IN ('upload', 'external_link')),
  file_path TEXT,
  external_url TEXT,
  original_filename TEXT,
  published_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO issues_new (id, product_id, issue_number, title, kind, file_path, published_at)
  SELECT id, product_id, issue_number, title, 'upload', file_path, published_at FROM issues;

DROP TABLE issues;
ALTER TABLE issues_new RENAME TO issues;

CREATE INDEX IF NOT EXISTS idx_issues_product ON issues(product_id);
