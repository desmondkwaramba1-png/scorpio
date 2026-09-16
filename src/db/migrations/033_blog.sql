-- The blog: admin-authored articles (how-to guides, marketplace news),
-- not creator or buyer content. There are no admin accounts/roles in this
-- app (see routes/admin.js's own top comment — disputes/payouts/etc are
-- all gated by a single shared ADMIN_KEY, not a login), so this table
-- doesn't pretend otherwise: author_name is free text the admin types,
-- not a foreign key to a real author record.
CREATE TABLE blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Unlike products.slug (see slugify() in routes/products.js, which
  -- always appends a random suffix because many different creators can
  -- title a product identically), a blog has one editorial owner and
  -- clean URLs matter more here. blog.js's own slugify() only appends a
  -- numeric suffix on an actual collision, not unconditionally.
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  -- Optional: falls back to a truncated plain-text version of the body
  -- at render time when left blank, same pattern Product.jsx's useSEO
  -- call already uses for a missing product description.
  excerpt TEXT,
  cover_path TEXT,
  body_markdown TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  author_name TEXT NOT NULL DEFAULT 'SCORPIO Team',
  -- NULL while a draft; set once, on the transition to 'published' (see
  -- routes/blog.js) - never overwritten by a later edit, so re-saving a
  -- published post doesn't quietly bump its publish date.
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- slug UNIQUE above already creates an implicit index - no separate one
-- needed, same reasoning products.slug already relies on.
CREATE INDEX idx_blog_posts_status_published ON blog_posts(status, published_at);
