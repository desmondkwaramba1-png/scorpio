const express = require('express');
const multer = require('multer');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../db/schema');
const { requireAuth, requireCreator } = require('../middleware/auth');
const storage = require('../lib/storage');

const router = express.Router();

// Real video, real limits — a phone-shot 30-60s clip at reasonable
// compression fits comfortably under this; going higher just invites
// someone uploading a full-length video course through the wrong endpoint
// (that's what a product file is for). Same reasoning as products.js's
// cover/file fileFilter: only real video types get past this, since
// whatever lands here is served straight back out as a public R2 object.
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter(req, file, cb) {
    if (VIDEO_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new Error('That file must be a video (MP4, WebM, or MOV).'));
  },
  limits: { fileSize: 60 * 1024 * 1024 }
});

const FEED_SELECT = `
  SELECT r.id, r.video_path, r.caption, r.view_count, r.created_at,
         c.handle AS creator_handle, c.name AS creator_name, c.avatar_path AS creator_avatar, c.verified AS creator_verified,
         p.slug AS product_slug, p.title AS product_title, p.price_minor, p.currency, p.cover_path AS product_cover
  FROM reels r
  JOIN creators c ON c.id = r.creator_id
  LEFT JOIN products p ON p.id = r.product_id
`;

// GET /api/reels — the public discovery feed. ?creator=handle scopes it to
// one storefront (how CreatorProfile.jsx embeds a creator's reels);
// ?product=slug scopes it to whatever's pitching one specific listing (how
// Product.jsx shows "see it in action" for a product's own reel, if it has
// one); unscoped is newest-first across everyone, capped, for the homepage
// tray.
router.get('/', (req, res) => {
  const { creator, product, limit } = req.query;
  const clauses = [];
  const params = [];

  if (creator) {
    clauses.push('c.handle = ?');
    params.push(creator);
  }
  if (product) {
    clauses.push('p.slug = ?');
    params.push(product);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const capped = Math.min(parseInt(limit, 10) || 0, 50);
  const limitSql = capped > 0 ? ' LIMIT ?' : '';
  if (capped > 0) params.push(capped);

  const reels = db.prepare(`${FEED_SELECT} ${where} ORDER BY r.created_at DESC${limitSql}`).all(...params);
  res.json(reels);
});

// POST /api/reels — creator_id always comes from the session. product_id
// (optional) is validated as one of THIS creator's own products — a reel
// can't be planted pointing at someone else's listing.
router.post('/', requireAuth, requireCreator, upload.single('video'), async (req, res) => {
  const { caption, product_id } = req.body;
  const video = req.file;

  if (!video) return res.status(400).json({ error: 'A video file is required.' });
  if (!storage.isConfigured()) return res.status(503).json({ error: 'File storage is not configured yet. Try again shortly.' });

  let productId = null;
  if (product_id) {
    const product = db.prepare('SELECT id FROM products WHERE id = ? AND creator_id = ?').get(product_id, req.creator.id);
    if (!product) return res.status(400).json({ error: "That product doesn't belong to you." });
    productId = product.id;
  }

  const key = `reels/${randomUUID()}${path.extname(video.originalname)}`;
  await storage.uploadBuffer(key, video.buffer, video.mimetype);

  const result = db.prepare(`
    INSERT INTO reels (creator_id, product_id, video_path, caption)
    VALUES (?, ?, ?, ?)
  `).run(req.creator.id, productId, storage.publicUrl(key), caption || null);

  const reel = db.prepare(`${FEED_SELECT} WHERE r.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(reel);
});

// POST /api/reels/:id/view — a lightweight, honest view counter (no login
// required, same reasoning as product share-clicks in products.js: this
// counts "a player started playing it," not a verified watch-through).
router.post('/:id/view', (req, res) => {
  const reel = db.prepare('SELECT id FROM reels WHERE id = ?').get(req.params.id);
  if (!reel) return res.status(404).json({ error: 'Reel not found.' });
  db.prepare('UPDATE reels SET view_count = view_count + 1 WHERE id = ?').run(reel.id);
  res.json({ ok: true });
});

// DELETE /api/reels/:id — owner only.
router.delete('/:id', requireAuth, requireCreator, (req, res) => {
  const reel = db.prepare('SELECT * FROM reels WHERE id = ?').get(req.params.id);
  if (!reel) return res.status(404).json({ error: 'Reel not found.' });
  if (reel.creator_id !== req.creator.id) return res.status(403).json({ error: "You don't own this reel." });

  db.prepare('DELETE FROM reels WHERE id = ?').run(reel.id);
  res.json({ ok: true });
});

module.exports = router;
