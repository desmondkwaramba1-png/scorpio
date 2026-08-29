-- Fixing a real bug before it could hit a real payment gateway: "ZIG" was
-- never a real currency code. Zimbabwe's gold-backed currency (ZiG in
-- common usage) has ISO code ZWG, and that's what Dischub actually accepts
-- ("USD" or "ZWG" only) — a product priced in "ZIG" would have been
-- rejected by the gateway on every single checkout attempt.

CREATE TABLE products_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK(type IN ('single','serial')),
  price_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency IN ('USD','ZWG')),
  pay_what_you_want INTEGER NOT NULL DEFAULT 0,
  min_price_minor INTEGER,
  quantity_limit INTEGER,
  quantity_sold INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  cover_path TEXT,
  slug TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);
INSERT INTO products_new SELECT
  id, creator_id, title, description, type, price_minor,
  CASE WHEN currency = 'ZIG' THEN 'ZWG' ELSE currency END,
  pay_what_you_want, min_price_minor, quantity_limit, quantity_sold,
  status, cover_path, slug, created_at
FROM products;
DROP TABLE products;
ALTER TABLE products_new RENAME TO products;

CREATE TABLE purchases_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id INTEGER NOT NULL REFERENCES buyers(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency IN ('USD','ZWG')),
  payment_reference TEXT,
  payment_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);
INSERT INTO purchases_new SELECT
  id, buyer_id, product_id, amount_minor,
  CASE WHEN currency = 'ZIG' THEN 'ZWG' ELSE currency END,
  payment_reference, payment_status, created_at
FROM purchases;
DROP TABLE purchases;
ALTER TABLE purchases_new RENAME TO purchases;
