-- A real, honest "try before you buy": a separate, explicitly-uploaded
-- clip the creator chooses (a genuine sample, not the paid file itself
-- with playback stopped client-side, which the buyer's browser devtools
-- would just ignore). Anyone can watch it, no purchase or login required.
-- Nullable and not category-restricted at the DB level — most useful for
-- courses, but nothing stops any product from having one.
ALTER TABLE products ADD COLUMN preview_video_path TEXT;
