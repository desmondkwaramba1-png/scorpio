const express = require('express');
const multer = require('multer');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../db/schema');
const { requireAdmin } = require('./admin');
const { requireAuth, requireCreator } = require('../middleware/auth');
const { optimizeImage } = require('../lib/imageProcessing');
const storage = require('../lib/storage');

const router = express.Router();

// Same stored-XSS reasoning products.js's own COVER_IMAGE_TYPES comment
// gives: an upload served back out at its own URL with whatever
// content-type the extension implies must never be allowed to be
// anything that renders/executes as a page.
const COVER_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
function coverFileFilter(req, file, cb) {
  if (COVER_IMAGE_TYPES.has(file.mimetype)) return cb(null, true);
  return cb(new Error('Cover must be an image (JPEG, PNG, WebP, or GIF).'));
}
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: coverFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // a blog cover, not a product deliverable
});

function objectKey(prefix, originalname) {
  return `${prefix}/${randomUUID()}${path.extname(originalname)}`;
}

// SQLite's own datetime('now') format (e.g. "2026-09-16 06:54:36") -
// every other timestamp column in this table (created_at, updated_at)
// already uses it via a column default. published_at didn't, and used
// JS's new Date().toISOString() instead (e.g. "2026-09-16T06:54:36.764Z")
// - a real bug, not a style choice: the GET /:slug and GET / routes below
// compare published_at <= datetime('now') as plain TEXT, and 'T' (0x54)
// sorts after a space (0x20), so an ISO-format published_at always
// compared as "later" than datetime('now') and a published post 404'd
// forever. Confirmed live before this fix.
function nowSql() {
  return db.prepare("SELECT datetime('now') AS now").get().now;
}

// Unlike products.js's slugify() (always appends a random suffix — many
// different creators can title a product identically), a blog has one
// editorial owner per post: try the clean slug first, only fall back to a
// numeric suffix on a real collision, so the normal case (no collision,
// ever) gets a real clean URL, not a random one. Shared across every
// author (admin and every creator both draw from the one blog_posts
// table/URL space), which is exactly why collisions need handling at all.
function baseSlugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
function uniqueSlug(title, excludeId) {
  const base = baseSlugify(title) || 'post';
  const existing = new Set(
    db.prepare('SELECT slug FROM blog_posts' + (excludeId ? ' WHERE id != ?' : ''))
      .all(...(excludeId ? [excludeId] : []))
      .map(r => r.slug)
  );
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

async function uploadCover(file) {
  let buffer = file.buffer;
  try { buffer = await optimizeImage(file.buffer, { maxWidth: 1600, enhance: true }); } catch (err) { console.error('[image optimize]', err); }
  const key = objectKey('blog-covers', file.originalname);
  await storage.uploadBuffer(key, buffer, file.mimetype);
  return storage.publicUrl(key);
}

const LIST_FIELDS = `
  bp.id, bp.slug, bp.title, bp.excerpt, bp.cover_path, bp.author_name, bp.published_at, bp.created_at,
  c.handle AS creator_handle, c.avatar_path AS creator_avatar
`;
const DETAIL_FIELDS = `
  bp.*, c.handle AS creator_handle, c.avatar_path AS creator_avatar,
  fp.title AS featured_product_title, fp.slug AS featured_product_slug, fp.cover_path AS featured_product_cover,
  fpc.handle AS featured_product_creator_handle
`;
const DETAIL_JOINS = `
  FROM blog_posts bp
  LEFT JOIN creators c ON c.id = bp.creator_id
  LEFT JOIN products fp ON fp.id = bp.featured_product_id
  LEFT JOIN creators fpc ON fpc.id = fp.creator_id
`;

// GET /api/blog — public, published only. A draft (or a creator's post
// still pending/rejected) is invisible here even to someone who knows its
// id, same as its own slug 404ing below.
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
  const posts = db.prepare(`
    SELECT ${LIST_FIELDS}
    FROM blog_posts bp
    LEFT JOIN creators c ON c.id = bp.creator_id
    WHERE bp.status = 'published' AND bp.published_at <= datetime('now')
    ORDER BY bp.published_at DESC
    LIMIT ?
  `).all(limit);
  res.json(posts);
});

// ---- creator-authored posts (requireAuth + requireCreator, not the
// admin key — a creator's own account is the whole access control here,
// same as every other /mine route in this app). Registered ahead of the
// public GET /:slug below: both are single path segments, and Express
// matches route registration order, not specificity — GET /:slug would
// otherwise swallow GET /mine as slug="mine" before this ever ran. ----

// GET /api/blog/mine — every post this creator has authored, any status,
// for their own "My posts" list (draft/pending/published/rejected all
// need to be visible to them, only the public feed hides the non-published
// ones).
router.get('/mine', requireAuth, requireCreator, (req, res) => {
  const posts = db.prepare(`
    SELECT bp.id, bp.slug, bp.title, bp.cover_path, bp.status, bp.rejection_note,
           bp.published_at, bp.created_at, bp.updated_at,
           fp.title AS featured_product_title
    FROM blog_posts bp
    LEFT JOIN products fp ON fp.id = bp.featured_product_id
    WHERE bp.creator_id = ?
    ORDER BY bp.created_at DESC
  `).all(req.creator.id);
  res.json(posts);
});

// GET /api/blog/mine/:id — one of the creator's own posts, any status,
// for their editor.
router.get('/mine/:id', requireAuth, requireCreator, (req, res) => {
  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ? AND creator_id = ?').get(req.params.id, req.creator.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  res.json(post);
});

// A creator can only feature one of their OWN products — otherwise the
// "want this?" callout becomes a way to advertise someone else's listing
// for free, or worse, dress up a scam link as coming from this creator's
// own approved post.
function resolveFeaturedProductId(req, raw) {
  if (!raw) return null;
  const product = db.prepare('SELECT id, creator_id FROM products WHERE id = ?').get(raw);
  if (!product || product.creator_id !== req.creator.id) {
    throw Object.assign(new Error('You can only feature one of your own products.'), { status: 400 });
  }
  return product.id;
}

// POST /api/blog/mine — create. A creator can never publish directly —
// "Submit for review" (status='pending_review') is the only non-draft
// state this route will ever set, no matter what the request body asks
// for. Actually going live is POST /admin/posts/:id/approve's job alone.
router.post('/mine', requireAuth, requireCreator, upload.single('cover'), async (req, res) => {
  const { title, excerpt, body_markdown, status, featured_product_id } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required.' });
  if (!body_markdown || !body_markdown.trim()) return res.status(400).json({ error: 'The post body is required.' });

  let featuredProductId;
  try { featuredProductId = resolveFeaturedProductId(req, featured_product_id); }
  catch (err) { return res.status(err.status || 400).json({ error: err.message }); }

  const slug = uniqueSlug(title);
  const postStatus = status === 'submit' ? 'pending_review' : 'draft';

  let coverPath = null;
  if (req.file) coverPath = await uploadCover(req.file);

  const result = db.prepare(`
    INSERT INTO blog_posts (slug, title, excerpt, cover_path, body_markdown, status, author_name, creator_id, featured_product_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(slug, title.trim(), (excerpt || '').trim() || null, coverPath, body_markdown, postStatus, req.creator.name, req.creator.id, featuredProductId);

  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(post);
});

// PATCH /api/blog/mine/:id — edit. A post already 'published' or
// 'rejected' goes back to 'pending_review' on any real content edit
// (title/body/excerpt/cover/featured product all count — a status-only
// save, e.g. draft->submit with nothing else touched, is handled by the
// same rule below since there's no way to tell "nothing changed" apart
// from "changed back to the same values" without a real diff, and
// re-review on a no-op edit is a false-positive worth accepting over the
// alternative: a rejected post silently going live again edited or not).
// A plain 'draft' stays 'draft' unless the creator explicitly submits.
router.patch('/mine/:id', requireAuth, requireCreator, upload.single('cover'), async (req, res) => {
  const existing = db.prepare('SELECT * FROM blog_posts WHERE id = ? AND creator_id = ?').get(req.params.id, req.creator.id);
  if (!existing) return res.status(404).json({ error: 'Post not found.' });

  const { title, excerpt, body_markdown, status, featured_product_id } = req.body;

  let featuredProductId = existing.featured_product_id;
  if (featured_product_id !== undefined) {
    try { featuredProductId = resolveFeaturedProductId(req, featured_product_id); }
    catch (err) { return res.status(err.status || 400).json({ error: err.message }); }
  }

  const submitting = status === 'submit';
  const nextStatus = submitting || ['published', 'rejected'].includes(existing.status) ? 'pending_review' : 'draft';

  let coverPath = existing.cover_path;
  if (req.file) coverPath = await uploadCover(req.file);

  db.prepare(`
    UPDATE blog_posts SET
      title = ?, excerpt = ?, cover_path = ?, body_markdown = ?,
      status = ?, featured_product_id = ?,
      rejection_note = CASE WHEN ? = 'pending_review' THEN NULL ELSE rejection_note END,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title !== undefined ? title.trim() : existing.title,
    excerpt !== undefined ? ((excerpt || '').trim() || null) : existing.excerpt,
    coverPath,
    body_markdown !== undefined ? body_markdown : existing.body_markdown,
    nextStatus,
    featuredProductId,
    nextStatus,
    existing.id
  );

  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(existing.id);
  res.json(post);
});

// DELETE /api/blog/mine/:id — a creator can pull their own post at any
// stage (draft, pending, published, or rejected), same as they can
// unpublish/delete their own products.
router.delete('/mine/:id', requireAuth, requireCreator, (req, res) => {
  const result = db.prepare('DELETE FROM blog_posts WHERE id = ? AND creator_id = ?').run(req.params.id, req.creator.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Post not found.' });
  res.json({ ok: true });
});

// ---- admin (ADMIN_KEY-gated, the platform operator's own posts plus
// review of every creator's). All two-plus path segments, so registration
// order relative to GET /:slug below never mattered for these — kept
// grouped here anyway for readability. ----

// GET /api/blog/admin/posts — every post, every author, every status.
router.get('/admin/posts', requireAdmin, (req, res) => {
  const posts = db.prepare(`
    SELECT bp.id, bp.slug, bp.title, bp.cover_path, bp.status, bp.author_name, bp.rejection_note,
           bp.published_at, bp.created_at, bp.updated_at,
           c.handle AS creator_handle
    FROM blog_posts bp
    LEFT JOIN creators c ON c.id = bp.creator_id
    ORDER BY
      CASE bp.status WHEN 'pending_review' THEN 0 ELSE 1 END,
      bp.created_at DESC
  `).all();
  res.json(posts);
});

// GET /api/blog/admin/posts/:id — one post (any status/author) for the
// editor, or for reviewing a creator's submission before approving it.
router.get('/admin/posts/:id', requireAdmin, (req, res) => {
  const post = db.prepare(`SELECT ${DETAIL_FIELDS} ${DETAIL_JOINS} WHERE bp.id = ?`).get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  res.json(post);
});

// POST /api/blog/admin/posts — create. Admin-authored only (no creator_id
// — see 033_blog.sql/034_creator_blog.sql's own comments on what NULL
// means here), and unlike a creator's POST /mine, this one really can go
// straight to 'published' — there's no separate review step for the
// platform's own posts.
router.post('/admin/posts', requireAdmin, upload.single('cover'), async (req, res) => {
  const { title, excerpt, body_markdown, status, author_name, slug: requestedSlug } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required.' });
  if (!body_markdown || !body_markdown.trim()) return res.status(400).json({ error: 'The post body is required.' });

  const slug = requestedSlug && requestedSlug.trim() ? uniqueSlug(requestedSlug) : uniqueSlug(title);
  const postStatus = status === 'published' ? 'published' : 'draft';
  const publishedAt = postStatus === 'published' ? nowSql() : null;

  let coverPath = null;
  if (req.file) coverPath = await uploadCover(req.file);

  const result = db.prepare(`
    INSERT INTO blog_posts (slug, title, excerpt, cover_path, body_markdown, status, author_name, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(slug, title.trim(), (excerpt || '').trim() || null, coverPath, body_markdown, postStatus, (author_name || '').trim() || 'SCORPIO Team', publishedAt);

  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(post);
});

// PATCH /api/blog/admin/posts/:id — edit any post, any author. Slug only
// changes if the admin explicitly sent a different one — a title edit
// alone never re-slugs (would silently break any link already shared).
// Deliberately doesn't touch creator_id/featured_product_id — an admin
// editing a creator's post for typos shouldn't accidentally detach it
// from its author or its linked product.
router.patch('/admin/posts/:id', requireAdmin, upload.single('cover'), async (req, res) => {
  const existing = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Post not found.' });

  const { title, excerpt, body_markdown, status, author_name, slug: requestedSlug } = req.body;

  let slug = existing.slug;
  if (requestedSlug && requestedSlug.trim() && baseSlugify(requestedSlug) !== existing.slug) {
    slug = uniqueSlug(requestedSlug, existing.id);
  }

  const postStatus = ['draft', 'pending_review', 'published', 'rejected'].includes(status) ? status : existing.status;
  // Set exactly once, on the actual transition into 'published' — never
  // overwritten by a later edit to an already-published post.
  const publishedAt = postStatus === 'published' && !existing.published_at ? nowSql() : existing.published_at;

  let coverPath = existing.cover_path;
  if (req.file) coverPath = await uploadCover(req.file);

  db.prepare(`
    UPDATE blog_posts SET
      slug = ?, title = ?, excerpt = ?, cover_path = ?, body_markdown = ?,
      status = ?, author_name = ?, published_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    slug,
    title !== undefined ? title.trim() : existing.title,
    excerpt !== undefined ? ((excerpt || '').trim() || null) : existing.excerpt,
    coverPath,
    body_markdown !== undefined ? body_markdown : existing.body_markdown,
    postStatus,
    author_name !== undefined ? ((author_name || '').trim() || 'SCORPIO Team') : existing.author_name,
    publishedAt,
    existing.id
  );

  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(existing.id);
  res.json(post);
});

// POST /api/blog/admin/posts/:id/approve — the only way a creator's post
// actually goes live. published_at is only set the first time (a
// resubmit-after-rejection that gets approved keeps its original
// published_at if it somehow already had one, though in practice a
// rejected post never had one yet either).
router.post('/admin/posts/:id/approve', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Post not found.' });
  if (existing.status !== 'pending_review') {
    return res.status(409).json({ error: `This post is ${existing.status}, not awaiting review.` });
  }
  const publishedAt = existing.published_at || nowSql();
  db.prepare(`
    UPDATE blog_posts SET status = 'published', published_at = ?, rejection_note = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(publishedAt, existing.id);
  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(existing.id);
  res.json(post);
});

// POST /api/blog/admin/posts/:id/reject — sends it back to the creator
// with a note explaining why, same "a human reviews, nothing automated"
// honesty the rest of this app's moderation already has (see
// reports.js/disputes). The creator's own PATCH /mine/:id re-submits it,
// which clears rejection_note automatically.
router.post('/admin/posts/:id/reject', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Post not found.' });
  if (existing.status !== 'pending_review') {
    return res.status(409).json({ error: `This post is ${existing.status}, not awaiting review.` });
  }
  const note = (req.body.note || '').trim();
  if (!note) return res.status(400).json({ error: "Explain what needs to change — this goes straight to the creator." });
  db.prepare(`UPDATE blog_posts SET status = 'rejected', rejection_note = ?, updated_at = datetime('now') WHERE id = ?`).run(note, existing.id);
  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(existing.id);
  res.json(post);
});

// DELETE /api/blog/admin/posts/:id
router.delete('/admin/posts/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM blog_posts WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Post not found.' });
  res.json({ ok: true });
});

// GET /api/blog/:slug — public, published only, full row (body included)
// plus the byline/product-callout data the post page renders. Registered
// last among the GETs on this router: every route above that could be
// mistaken for a :slug value (mine, admin) is registered first.
router.get('/:slug', (req, res) => {
  const post = db.prepare(`
    SELECT ${DETAIL_FIELDS} ${DETAIL_JOINS}
    WHERE bp.slug = ? AND bp.status = 'published' AND bp.published_at <= datetime('now')
  `).get(req.params.slug);
  if (!post) return res.status(404).json({ error: 'This post could not be found.' });
  res.json(post);
});

module.exports = router;
