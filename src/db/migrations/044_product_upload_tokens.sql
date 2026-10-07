CREATE TABLE product_upload_tokens (
  token_hash TEXT PRIMARY KEY,
  creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('POST', 'PATCH')),
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((method = 'POST' AND product_id IS NULL) OR (method = 'PATCH' AND product_id IS NOT NULL))
);

CREATE INDEX idx_product_upload_tokens_expiry
  ON product_upload_tokens(expires_at);
