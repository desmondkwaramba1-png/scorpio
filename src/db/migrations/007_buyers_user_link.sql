-- Lets a logged-in buyer see their own purchase history. Guest checkout
-- (no login) still works fine — user_id just stays null for those rows.

ALTER TABLE buyers ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_buyers_user_id ON buyers(user_id);
