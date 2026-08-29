-- Buyer reviews: star rating + optional text, tied to a specific paid
-- purchase so only someone who actually bought the product can leave one.
-- One review per purchase (not per product/buyer) — a repeat buyer who
-- orders again gets to leave a fresh review for that order.
CREATE TABLE IF NOT EXISTS product_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  body TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(purchase_id)
);
CREATE INDEX IF NOT EXISTS idx_product_reviews_product ON product_reviews(product_id);
