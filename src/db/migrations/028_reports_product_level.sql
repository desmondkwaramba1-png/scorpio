-- Extends reports (027) to cover a report with no purchase behind it at
-- all — a seller flagging another seller's PRODUCT as a copy/similar
-- listing, or anyone flagging a product as misleading, is a real report
-- with no order to attach it to. SQLite can't ALTER a column's NOT NULL
-- or add a CHECK to an existing table, so this rebuilds it (same pattern
-- other migrations already use — see migrate.js's note on foreign_keys).
--
-- reporter_role now describes the reporter's own account (do they have a
-- creator profile or not) rather than "buyer vs seller of this specific
-- order" — the natural reading breaks down once a report isn't tied to
-- an order both parties share.

CREATE TABLE reports_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER REFERENCES purchases(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  reporter_user_id INTEGER NOT NULL REFERENCES users(id),
  reporter_role TEXT NOT NULL CHECK(reporter_role IN ('buyer', 'creator')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
  admin_note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT,
  CHECK (purchase_id IS NOT NULL OR product_id IS NOT NULL)
);

INSERT INTO reports_new (id, purchase_id, product_id, reporter_user_id, reporter_role, reason, status, admin_note, created_at, resolved_at)
SELECT id, purchase_id, NULL, reporter_user_id, reporter_role, reason, status, admin_note, created_at, resolved_at FROM reports;

DROP TABLE reports;
ALTER TABLE reports_new RENAME TO reports;

CREATE INDEX IF NOT EXISTS idx_reports_purchase ON reports(purchase_id);
CREATE INDEX IF NOT EXISTS idx_reports_product ON reports(product_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
