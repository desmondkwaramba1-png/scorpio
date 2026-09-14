-- Recurring subscriptions: a product's price is charged every period
-- instead of once, and access depends on staying current, not on having
-- paid once ever. Content still delivers through the exact same `issues`
-- mechanism `serial` products already use (see 031_serial_issues.sql) —
-- this is a new billing relationship layered on top of that, not a new
-- content-delivery mechanism.
--
-- type's CHECK constraint needs widening to allow 'subscription', which
-- SQLite can only do via a table rebuild (same pattern 020_services.sql
-- used to add 'service'). Every existing column carries through
-- unchanged — this list was verified against the live production schema
-- directly (PRAGMA table_info(products)), not reconstructed from reading
-- migration files alone, after an earlier incident this session where
-- migration history and live schema had quietly drifted apart.
CREATE TABLE products_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK(type IN ('single','serial','service','subscription')),
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
  delivery_days INTEGER,
  service_terms TEXT,
  review_status TEXT NOT NULL DEFAULT 'clear' CHECK(review_status IN ('clear','flagged')),
  flag_reason TEXT,
  preview_video_path TEXT
);
INSERT INTO products_new
  (id, creator_id, title, description, type, price_minor, currency, pay_what_you_want,
   min_price_minor, quantity_limit, quantity_sold, status, cover_path, slug, created_at,
   category, discount_percent, discount_limit, discount_claimed, portfolio_url, delivery_days,
   service_terms, review_status, flag_reason, preview_video_path)
SELECT
  id, creator_id, title, description, type, price_minor, currency, pay_what_you_want,
  min_price_minor, quantity_limit, quantity_sold, status, cover_path, slug, created_at,
  category, discount_percent, discount_limit, discount_claimed, portfolio_url, delivery_days,
  service_terms, review_status, flag_reason, preview_video_path
FROM products;
DROP TABLE products;
ALTER TABLE products_new RENAME TO products;
-- Indexes on products don't survive a rename-based rebuild (they were
-- dropped along with the old table) — recreate the two from
-- 030_perf_indexes.sql so this migration doesn't silently regress them.
CREATE INDEX IF NOT EXISTS idx_products_creator_id ON products(creator_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_review_status ON products(review_status);

-- The subscription relationship itself, separate from any single charge.
-- One row per (buyer, product), reused for the relationship's whole
-- lifetime — resubscribing after lapsing updates this same row rather
-- than creating a second one (see findOrCreateSubscription in
-- src/lib/subscriptions.js).
CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id INTEGER NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  -- Always required, even though every row this feature creates also has
  -- product_id set — this is what lets a future whole-creator
  -- subscription (product_id NULL) reuse this same table without a
  -- rework later: creator_id is never derived only from product_id.
  creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  -- Nullable on purpose, reserved for that future whole-creator row.
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','lapsed','canceled')),
  -- Locked in from what was actually charged at subscribe/renew time,
  -- never read live from products.price_minor on renewal — a creator
  -- raising their price later doesn't silently re-charge an existing
  -- subscriber more than they originally agreed to.
  price_minor INTEGER NOT NULL,
  currency TEXT NOT NULL CHECK(currency IN ('USD','ZWG')),
  current_period_start TEXT NOT NULL DEFAULT (datetime('now')),
  current_period_end TEXT NOT NULL,
  canceled_at TEXT,
  -- Two separate idempotency flags for the one scheduled sweep this
  -- feature has (see admin.js's /subscriptions/sweep), not one column
  -- doing double duty for two different emails. Each is reset to NULL by
  -- findOrCreateSubscription() on every real renewal, and set exactly
  -- once by its own pass in sendRenewalReminders().
  reminder_sent_at TEXT,
  lapse_notice_sent_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
-- NULLs aren't equal in a UNIQUE index in SQLite, so this only actually
-- constrains rows where product_id IS NOT NULL (every v1 row) — it does
-- not block a future product_id-NULL whole-creator row, which will need
-- its own separate partial unique index on (buyer_id, creator_id) WHERE
-- product_id IS NULL when that ships.
CREATE UNIQUE INDEX idx_subscriptions_buyer_product ON subscriptions(buyer_id, product_id);
CREATE INDEX idx_subscriptions_status_period ON subscriptions(status, current_period_end);
CREATE INDEX idx_subscriptions_creator ON subscriptions(creator_id);

-- NULL on every ordinary purchase; set on both the first subscribe and
-- every later renewal charge, same "NULL unless this specific flow
-- applies" shape purchases.fulfillment_status already uses. A plain ADD
-- COLUMN with a REFERENCES clause, no CHECK involved — no rebuild
-- needed (same precedent as 007_buyers_user_link.sql's buyers.user_id).
ALTER TABLE purchases ADD COLUMN subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_purchases_subscription_id ON purchases(subscription_id);
