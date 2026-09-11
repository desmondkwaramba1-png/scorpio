-- Load-test finding: products and purchases — the two busiest tables in
-- the app — had almost no indexes (products only had one on
-- review_status; purchases had none at all, not even on product_id or
-- buyer_id). Every marketplace listing, every storefront, every "my
-- orders" page, every order-status poll during checkout, and the payment
-- webhook were doing a full table scan. better-sqlite3 is synchronous —
-- it blocks Node's event loop for the duration of each query — so a slow
-- query doesn't just answer slowly, it stalls every other concurrent
-- request behind it. This is purely additive (CREATE INDEX only); it
-- changes no behavior, only how fast SQLite can find the rows.

CREATE INDEX IF NOT EXISTS idx_products_creator_id ON products(creator_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

CREATE INDEX IF NOT EXISTS idx_purchases_product_id ON purchases(product_id);
CREATE INDEX IF NOT EXISTS idx_purchases_buyer_id ON purchases(buyer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_payment_reference ON purchases(payment_reference);
CREATE INDEX IF NOT EXISTS idx_purchases_payment_status ON purchases(payment_status);

-- Sessions are read on literally every authenticated request (attachUser,
-- src/middleware/auth.js) by id — id is the primary key so that lookup was
-- already fast, but expiry cleanup and user_id lookups were not indexed.
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
