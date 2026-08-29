-- Services: bespoke work sold on trust in a portfolio, not a fixed file —
-- fundamentally a different transaction than instant digital delivery, so
-- money has to be held (escrow) rather than counted as available the
-- moment payment clears. type's CHECK constraint needs widening to allow
-- it, which SQLite can only do via a table rebuild (same pattern as
-- 015_currency_zwg.sql). portfolio_url and delivery_days are added in the
-- same rebuild since they're new columns anyway.
CREATE TABLE products_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK(type IN ('single','serial','service')),
  price_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency IN ('USD','ZWG')),
  pay_what_you_want INTEGER NOT NULL DEFAULT 0,
  min_price_minor INTEGER,
  quantity_limit INTEGER,
  quantity_sold INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  cover_path TEXT,
  slug TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  category TEXT,
  discount_percent INTEGER,
  discount_limit INTEGER,
  discount_claimed INTEGER NOT NULL DEFAULT 0,
  portfolio_url TEXT,
  delivery_days INTEGER
);
INSERT INTO products_new
  (id, creator_id, title, description, type, price_minor, currency, pay_what_you_want,
   min_price_minor, quantity_limit, quantity_sold, status, cover_path, slug, created_at,
   category, discount_percent, discount_limit, discount_claimed)
SELECT
  id, creator_id, title, description, type, price_minor, currency, pay_what_you_want,
  min_price_minor, quantity_limit, quantity_sold, status, cover_path, slug, created_at,
  category, discount_percent, discount_limit, discount_claimed
FROM products;
DROP TABLE products;
ALTER TABLE products_new RENAME TO products;

-- Service orders only. NULL on every ordinary digital-goods purchase,
-- which is what lets the wallet balance query below tell the two kinds of
-- purchase apart with a single WHERE clause instead of a products join.
--   awaiting_delivery -> delivered -> released   (happy path, or timeout)
--                                  -> disputed -> resolved_refund / resolved_release
ALTER TABLE purchases ADD COLUMN fulfillment_status TEXT;
ALTER TABLE purchases ADD COLUMN delivered_at TEXT;

-- What the seller actually attached as proof of delivery. message is
-- always required (a plain description of what was delivered); file/link
-- are optional on top of it.
CREATE TABLE service_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  storage_path TEXT,
  original_filename TEXT,
  external_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- A buyer-filed report. Resolution is manual for now (no admin UI yet) —
-- this table is the whole "queue": query WHERE status = 'open'.
CREATE TABLE service_disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved_refund','resolved_release')),
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT,
  resolution_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_service_disputes_status ON service_disputes(status);
