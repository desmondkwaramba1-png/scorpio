-- What a buyer needs to see before trusting a bespoke-work order enough to
-- pay for it: not just "here's my portfolio" but the actual terms —
-- revisions included, what's required from the buyer, cancellation policy.
-- A plain ADD COLUMN, no CHECK involved, so no table-rebuild dance needed.
ALTER TABLE products ADD COLUMN service_terms TEXT;
