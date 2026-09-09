-- General problem reports on any order — buyer or seller, any product
-- type. The escrow dispute system (service_disputes) only ever covered
-- 'service' orders (custom/manual delivery, held payment); an ordinary
-- digital-goods purchase (the overwhelming majority of orders — ebooks,
-- templates, courses) had no reporting path at all for either side. This
-- doesn't hold or move money — it's a queue a human (the admin) reads and
-- acts on manually, same as disputes already are.

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  reporter_user_id INTEGER NOT NULL REFERENCES users(id),
  reporter_role TEXT NOT NULL CHECK(reporter_role IN ('buyer', 'creator')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
  admin_note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_reports_purchase ON reports(purchase_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
