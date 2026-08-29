-- Real categories so "browse similar products" means something. `type`
-- (single/serial) describes delivery pattern, not subject matter — this is
-- the actual browsing dimension.
ALTER TABLE products ADD COLUMN category TEXT;
