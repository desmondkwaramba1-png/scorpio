-- Likes, comments, and share-clicks on products. Shares don't require login
-- (sharing is low-friction and every "share" button on the web only ever
-- counts clicks/intents, not confirmed posts elsewhere — this is no
-- different), but likes and comments are tied to an account.

CREATE TABLE IF NOT EXISTS product_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(product_id, user_id)
);

CREATE TABLE IF NOT EXISTS product_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_product_comments_product ON product_comments(product_id);

CREATE TABLE IF NOT EXISTS product_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK(channel IN ('whatsapp','facebook','instagram','tiktok','copy_link')),
  created_at TEXT DEFAULT (datetime('now'))
);
