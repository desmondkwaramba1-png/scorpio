CREATE TABLE product_publish_requests (
  creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  product_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (creator_id, request_key)
);

CREATE INDEX idx_product_publish_requests_pending
  ON product_publish_requests(created_at)
  WHERE product_id IS NULL;