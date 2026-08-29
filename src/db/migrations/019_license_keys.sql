-- Software delivery, distinct from a file: a buyer needs a unique key, not
-- a copy of a shared download. A creator bulk-pastes a batch; each paid
-- purchase claims exactly one unclaimed row, so "keys left" is always a
-- real count, never a number someone typed into a quantity field.
CREATE TABLE IF NOT EXISTS license_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  key_value TEXT NOT NULL,
  purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
  claimed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_license_keys_product ON license_keys(product_id, claimed_at);
CREATE INDEX IF NOT EXISTS idx_license_keys_purchase ON license_keys(purchase_id);
