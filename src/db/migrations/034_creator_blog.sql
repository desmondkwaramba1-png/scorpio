-- Opens the blog to creators, not just the admin-authored posts 033
-- built for. A creator post goes straight to 'pending_review' on submit
-- (never directly to 'published' - see routes/blog.js), the admin
-- approves or rejects it from the same admin app the platform's own
-- posts already publish from. creator_id NULL keeps meaning exactly what
-- it already implicitly meant before this migration: a platform/admin
-- post, not a creator's - existing rows don't need backfilling.
--
-- featured_product_id lets a creator's post end in a real "want this?"
-- callout linking one of their own listings - the actual content-to-
-- commerce link, not just "creators can also blog." Set-null on the
-- product's own deletion rather than blocking it or cascading the post
-- away - the post (and its SEO value) should survive a creator retiring
-- one listing.
--
-- SQLite can't ALTER a CHECK constraint in place, same reason
-- 031_serial_issues.sql rebuilt its table instead of altering it.
CREATE TABLE blog_posts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  cover_path TEXT,
  body_markdown TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_review','published','rejected')),
  author_name TEXT NOT NULL DEFAULT 'SCORPIO Team',
  creator_id INTEGER REFERENCES creators(id) ON DELETE SET NULL,
  featured_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  rejection_note TEXT,
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO blog_posts_new (id, slug, title, excerpt, cover_path, body_markdown, status, author_name, published_at, created_at, updated_at)
  SELECT id, slug, title, excerpt, cover_path, body_markdown, status, author_name, published_at, created_at, updated_at FROM blog_posts;

DROP TABLE blog_posts;
ALTER TABLE blog_posts_new RENAME TO blog_posts;

CREATE INDEX idx_blog_posts_status_published ON blog_posts(status, published_at);
CREATE INDEX idx_blog_posts_creator ON blog_posts(creator_id);
