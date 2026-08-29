-- Money as integer minor units (cents), never floats — and the fields
-- Phase 1 product creation needs: currency, pay-what-you-want, quantity
-- limits, draft/publish status.

CREATE TABLE products_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK(type IN ('single','serial')),
  price_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency IN ('USD','ZIG')),
  pay_what_you_want INTEGER NOT NULL DEFAULT 0,
  min_price_minor INTEGER,
  quantity_limit INTEGER,
  quantity_sold INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  cover_path TEXT,
  slug TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO products_new (id, creator_id, title, description, type, price_minor, currency, status, cover_path, slug, created_at)
SELECT id, creator_id, title, description, type, CAST(ROUND(price * 100) AS INTEGER), 'USD', 'published', cover_path, slug, created_at
FROM products;

DROP TABLE products;
ALTER TABLE products_new RENAME TO products;
