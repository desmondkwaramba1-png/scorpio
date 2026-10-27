-- When a creator's payout destination last changed. Lets the admin payout
-- queue flag a freshly-changed number (the classic account-takeover cash-out)
-- before money is sent to it.
ALTER TABLE creators ADD COLUMN payout_changed_at TEXT;
