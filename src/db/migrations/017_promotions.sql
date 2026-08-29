-- Percentage-off promotions. discount_limit is nullable: null means a
-- blanket discount (everyone, no cap); a number means "first X buyers" —
-- once discount_claimed reaches it, the promo stops applying on its own.
-- The seller extends it by raising discount_limit (see PATCH /api/products/:id).
ALTER TABLE products ADD COLUMN discount_percent INTEGER;
ALTER TABLE products ADD COLUMN discount_limit INTEGER;
ALTER TABLE products ADD COLUMN discount_claimed INTEGER NOT NULL DEFAULT 0;

-- Recorded per purchase so markPurchasePaid knows whether this specific
-- paid order should count against the product's claim cap — a pending or
-- failed order must never consume a claim.
ALTER TABLE purchases ADD COLUMN discount_applied INTEGER NOT NULL DEFAULT 0;
