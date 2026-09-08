-- Records an actual payout event (an admin sending money to a creator's
-- EcoCash number by hand, same manual process wallet.js's withdraw stub
-- always described honestly). Without this, "available balance" would
-- show the same money as owed again the next week, since nothing else
-- tracks that it already went out. walletBalances.js subtracts the sum of
-- a creator's rows here from what would otherwise be their available
-- balance.
CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL,
  note TEXT,
  paid_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payouts_creator ON payouts(creator_id);
