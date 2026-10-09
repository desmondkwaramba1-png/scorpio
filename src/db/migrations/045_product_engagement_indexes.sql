-- The public product feed and detail pages do repeated likes/shares/cart
-- lookups per request, and SQLite does a full scan on those tables without
-- indexes. Indexes are additive and preserve behavior while letting the DB
-- answer these frequent read operations much faster under load.

CREATE INDEX IF NOT EXISTS idx_product_likes_product ON product_likes(product_id);
CREATE INDEX IF NOT EXISTS idx_product_likes_user ON product_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_product_shares_product ON product_shares(product_id);
CREATE INDEX IF NOT EXISTS idx_product_shares_user ON product_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product ON cart_items(product_id);
CREATE INDEX IF NOT EXISTS idx_product_files_product ON product_files(product_id);
CREATE INDEX IF NOT EXISTS idx_products_status_created_at
  ON products(status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_products_status_category_created_at
  ON products(status, category, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_products_status_price
  ON products(status, price_minor, id);
CREATE INDEX IF NOT EXISTS idx_products_status_bestselling
  ON products(status, quantity_sold DESC, created_at DESC, id DESC);
