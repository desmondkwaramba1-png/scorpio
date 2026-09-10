-- Extends reports (027, 028) once more to cover a report tied to neither
-- an order nor a product at all — "the checkout page is broken," "I can't
-- log in," general feedback. The previous CHECK required at least one of
-- purchase_id/product_id; this drops it so both can be null. Also opens
-- reporting to logged-out visitors: the whole point of catching "I can't
-- log in" is that the person hitting it may not be able to authenticate
-- to report it, so reporter_user_id/reporter_role become nullable and a
-- reporter_email column is added for how to reach an anonymous reporter
-- back (required by the route when there's no logged-in user; optional
-- otherwise, since a logged-in reporter's email is already on their
-- account). subject gives the admin queue something to triage by at a
-- glance for a report with no order/product context to show instead.

CREATE TABLE reports_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER REFERENCES purchases(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  reporter_user_id INTEGER REFERENCES users(id),
  reporter_role TEXT CHECK(reporter_role IS NULL OR reporter_role IN ('buyer', 'creator')),
  reporter_email TEXT,
  subject TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
  admin_note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);

INSERT INTO reports_new (id, purchase_id, product_id, reporter_user_id, reporter_role, subject, reason, status, admin_note, created_at, resolved_at)
SELECT id, purchase_id, product_id, reporter_user_id, reporter_role, NULL, reason, status, admin_note, created_at, resolved_at FROM reports;

DROP TABLE reports;
ALTER TABLE reports_new RENAME TO reports;

CREATE INDEX IF NOT EXISTS idx_reports_purchase ON reports(purchase_id);
CREATE INDEX IF NOT EXISTS idx_reports_product ON reports(product_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
