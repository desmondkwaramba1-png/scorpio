-- Real, mechanical checks run on every uploaded product file: does the file
-- actually exist and open as the type it claims to be, and is it the exact
-- same bytes as something another creator already listed. Nothing here is
-- a judgment call or an AI opinion about quality; it's arithmetic on the
-- file itself (a hash, a magic-byte read, a page count) or reused DB rows,
-- which is what makes it something this app can actually run for real
-- instead of only pretending to.
ALTER TABLE product_files ADD COLUMN file_hash TEXT;
ALTER TABLE product_files ADD COLUMN detected_mime TEXT;
ALTER TABLE product_files ADD COLUMN page_count INTEGER;
CREATE INDEX IF NOT EXISTS idx_product_files_hash ON product_files(file_hash);

-- review_status starts 'clear' (not 'pending') so a product with nothing
-- suspicious about it is never stuck waiting on a human who doesn't need
-- to look at it — only a real automated finding (duplicate hash, a
-- type/extension mismatch, a page count that contradicts the listing's
-- own description) flips it to 'flagged'.
ALTER TABLE products ADD COLUMN review_status TEXT NOT NULL DEFAULT 'clear' CHECK(review_status IN ('clear','flagged'));
ALTER TABLE products ADD COLUMN flag_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_products_review_status ON products(review_status);
