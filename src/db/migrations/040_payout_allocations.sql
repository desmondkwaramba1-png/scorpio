CREATE TABLE payout_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payout_id INTEGER NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  UNIQUE(payout_id, purchase_id)
);
CREATE INDEX idx_payout_allocations_purchase ON payout_allocations(purchase_id);