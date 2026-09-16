const express = require('express');
const multer = require('multer');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../db/schema');
const { requireAdmin } = require('./admin');
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
// editorial owner: try the clean slug first, only fall back to a numeric
// suffix on a real collision, so the normal case (no collision, ever) gets
// a real clean URL, not a random one.
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

const LIST_FIELDS = 'id, slug, title, excerpt, cover_path, author_name, published_at, created_at';

// GET /api/blog — public, published only. A draft is invisible here even
// to someone who knows its id, same as its own slug 404ing below.
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
  const posts = db.prepare(`
    SELECT ${LIST_FIELDS} FROM blog_posts
    WHERE status = 'published' AND published_at <= datetime('now')
    ORDER BY published_at DESC
    LIMIT ?
  `).all(limit);
  res.json(posts);
});

// GET /api/blog/:slug — public, published only, full row (body included).
router.get('/:slug', (req, res) => {
  const post = db.prepare(`
    SELECT * FROM blog_posts
    WHERE slug = ? AND status = 'published' AND published_at <= datetime('now')
  `).get(req.params.slug);
  if (!post) return res.status(404).json({ error: 'This post could not be found.' });
  res.json(post);
});

// GET /api/blog/admin/posts — every post, draft and published.
router.get('/admin/posts', requireAdmin, (req, res) => {
  const posts = db.prepare(`
    SELECT id, slug, title, status, author_name, published_at, created_at, updated_at
    FROM blog_posts ORDER BY created_at DESC
  `).all();
  res.json(posts);
});

// GET /api/blog/admin/posts/:id — one post (drafts included) for the editor.
router.get('/admin/posts/:id', requireAdmin, (req, res) => {
  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  res.json(post);
});

// POST /api/blog/admin/posts — create.
router.post('/admin/posts', requireAdmin, upload.single('cover'), async (req, res) => {
  const { title, excerpt, body_markdown, status, author_name, slug: requestedSlug } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required.' });
  if (!body_markdown || !body_markdown.trim()) return res.status(400).json({ error: 'The post body is required.' });

  const slug = requestedSlug && requestedSlug.trim() ? uniqueSlug(requestedSlug) : uniqueSlug(title);
  const postStatus = status === 'published' ? 'published' : 'draft';
  const publishedAt = postStatus === 'published' ? nowSql() : null;

  let coverPath = null;
  if (req.file) {
    let buffer = req.file.buffer;
    try { buffer = await optimizeImage(req.file.buffer, { maxWidth: 1600, enhance: true }); } catch (err) { console.error('[image optimize]', err); }
    const key = objectKey('blog-covers', req.file.originalname);
    await storage.uploadBuffer(key, buffer, req.file.mimetype);
    coverPath = storage.publicUrl(key);
  }

  const result = db.prepare(`
    INSERT INTO blog_posts (slug, title, excerpt, cover_path, body_markdown, status, author_name, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(slug, title.trim(), (excerpt || '').trim() || null, coverPath, body_markdown, postStatus, (author_name || '').trim() || 'SCORPIO Team', publishedAt);

  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(post);
});

// PATCH /api/blog/admin/posts/:id — edit. Slug only changes if the admin
// explicitly sent a different one — a title edit alone never re-slugs
// (would silently break any link already shared).
router.patch('/admin/posts/:id', requireAdmin, upload.single('cover'), async (req, res) => {
  const existing = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Post not found.' });

  const { title, excerpt, body_markdown, status, author_name, slug: requestedSlug } = req.body;

  let slug = existing.slug;
  if (requestedSlug && requestedSlug.trim() && baseSlugify(requestedSlug) !== existing.slug) {
    slug = uniqueSlug(requestedSlug, existing.id);
  }

  const postStatus = status === 'published' ? 'published' : status === 'draft' ? 'draft' : existing.status;
  // Set exactly once, on the actual draft -> published transition — never
  // overwritten by a later edit to an already-published post.
  const publishedAt = postStatus === 'published' && !existing.published_at ? nowSql() : existing.published_at;

  let coverPath = existing.cover_path;
  if (req.file) {
    let buffer = req.file.buffer;
    try { buffer = await optimizeImage(req.file.buffer, { maxWidth: 1600, enhance: true }); } catch (err) { console.error('[image optimize]', err); }
    const key = objectKey('blog-covers', req.file.originalname);
    await storage.uploadBuffer(key, buffer, req.file.mimetype);
    coverPath = storage.publicUrl(key);
  }

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

// DELETE /api/blog/admin/posts/:id
router.delete('/admin/posts/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM blog_posts WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Post not found.' });
  res.json({ ok: true });
});

module.exports = router;
