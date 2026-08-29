-- Short creator videos, tied to the marketplace on purpose: every reel
-- belongs to a creator, and optionally to one specific product it's
-- pitching. There's no freestanding "content" here — a reel with no
-- product_id is still a creator intro living on their storefront, not a
-- disconnected entertainment feed. product_id uses SET NULL (not CASCADE)
-- because deleting the product it once promoted shouldn't delete the video
-- itself — it just stops pointing at a specific buy button.
CREATE TABLE IF NOT EXISTS reels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  video_path TEXT NOT NULL,
  caption TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reels_creator ON reels(creator_id);
CREATE INDEX IF NOT EXISTS idx_reels_product ON reels(product_id);
CREATE INDEX IF NOT EXISTS idx_reels_created ON reels(created_at);
