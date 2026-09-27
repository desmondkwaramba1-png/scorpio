-- Deriv-style dispute thread: the 5-day hold already pauses when
-- fulfillment_status becomes 'disputed' (sweepAutoReleases only advances
-- 'delivered'), but there was nowhere for buyer and seller to talk, and
-- nowhere to attach screenshots. Resolution stays a human admin step.

ALTER TABLE service_disputes ADD COLUMN opened_by_user_id INTEGER REFERENCES users(id);

CREATE TABLE IF NOT EXISTS dispute_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispute_id INTEGER NOT NULL REFERENCES service_disputes(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_role TEXT NOT NULL CHECK(author_role IN ('buyer','seller','admin')),
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dispute_messages_dispute ON dispute_messages(dispute_id, id);

CREATE TABLE IF NOT EXISTS dispute_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispute_id INTEGER NOT NULL REFERENCES service_disputes(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_role TEXT NOT NULL CHECK(author_role IN ('buyer','seller','admin')),
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  mime TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute ON dispute_evidence(dispute_id, id);

-- One open case per order. A resolved dispute can exist alongside a later
-- one in theory, but the app never re-opens a closed case.
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_disputes_one_open
  ON service_disputes(purchase_id) WHERE status = 'open';
