-- A logged-in buyer's cart. No quantity column — digital goods aren't
-- bought in multiples of the same item, so a row's mere presence means
-- "one unit, added once." The unique constraint enforces that directly
-- instead of needing app-level dedup logic.
CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_cart_items_user ON cart_items(user_id);
