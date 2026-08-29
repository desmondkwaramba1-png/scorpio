-- Match purchases to the same integer-minor-unit convention as products.

CREATE TABLE purchases_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id INTEGER NOT NULL REFERENCES buyers(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency IN ('USD','ZIG')),
  payment_reference TEXT,
  payment_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO purchases_new (id, buyer_id, product_id, amount_minor, payment_reference, payment_status, created_at)
SELECT id, buyer_id, product_id, CAST(ROUND(amount * 100) AS INTEGER), payment_reference, payment_status, created_at
FROM purchases;

DROP TABLE purchases;
ALTER TABLE purchases_new RENAME TO purchases;
