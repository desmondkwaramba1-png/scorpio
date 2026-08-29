const express = require('express');
const multer = require('multer');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { getVerificationCriteria, checkAndUpdateVerification } = require('../lib/verification');
const { optimizeImage } = require('../lib/imageProcessing');
const { UPLOADS_DIR } = require('../lib/paths');

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `avatar-${randomUUID()}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB, this is a profile photo, not a product file
});

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;

// Every top-level static route in App.jsx — a creator whose handle matches
// one of these would have a storefront permanently unreachable at /:handle
// (the static route always wins), silently. Same list has to be kept in
// sync with App.jsx's routes by hand since there's no shared source of
// truth between the two; worth a quick check if a new top-level route is
// ever added there.
const RESERVED_HANDLES = new Set([
  'discover', 'login', 'oauth-complete', 'forgot-password', 'reset-password',
  'verify-email', 'terms', 'accept-terms', 'onboarding', 'account', 'cart',
  'checkout', 'dashboard', 'creators', 'payment'
]);

function publicCreator(row) {
  if (!row) return row;
  const { payout_ecocash_number, payout_bank_details, ...pub } = row;
  return pub;
}

// POST /api/creators — onboarding. Logged-in only, one creator profile per
// user. what_selling and who_for are the qualification questions: light
// friction, real signal, asked once.
router.post('/', requireAuth, upload.single('avatar'), async (req, res) => {
  const { handle, name, bio, what_selling, who_for, payout_ecocash_number, payout_bank_details } = req.body;

  if (!handle || !name || !what_selling || !who_for) {
    return res.status(400).json({ error: 'handle, name, what_selling, and who_for are required.' });
  }
  if (!HANDLE_RE.test(handle)) {
    return res.status(400).json({
      error: 'Handle must be 3-30 characters, lowercase letters, numbers, and hyphens only.'
    });
  }
  if (RESERVED_HANDLES.has(handle)) {
    return res.status(400).json({ error: 'That handle is reserved. Please choose another.' });
  }

  const existing = db.prepare('SELECT id FROM creators WHERE user_id = ?').get(req.user.id);
  if (existing) return res.status(409).json({ error: 'You already have a creator profile.' });

  if (req.file) {
    try { await optimizeImage(req.file.path, { maxWidth: 480 }); } catch (err) { console.error('[image optimize]', err); }
  }

  try {
    const avatarPath = req.file ? `/uploads/${req.file.filename}` : null;
    const result = db.prepare(`
      INSERT INTO creators
        (user_id, handle, name, bio, what_selling, who_for, avatar_path, payout_ecocash_number, payout_bank_details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, handle, name, bio || null, what_selling, who_for, avatarPath,
      payout_ecocash_number || null,
      payout_bank_details ? JSON.stringify(JSON.parse(payout_bank_details)) : null
    );

    checkAndUpdateVerification(result.lastInsertRowid);
    const creator = db.prepare('SELECT * FROM creators WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(creator);
  } catch (err) {
    if (err.message.includes('UNIQUE') && err.message.includes('handle')) {
      return res.status(409).json({ error: 'That handle is already taken.' });
    }
    res.status(500).json({ error: 'Could not create creator profile.' });
  }
});

// PATCH /api/creators/me — edit your own profile. Handle is intentionally
// not editable here to keep published product links stable.
router.patch('/me', requireAuth, upload.single('avatar'), async (req, res) => {
  if (!req.creator) return res.status(404).json({ error: 'No creator profile yet.' });

  if (req.file) {
    try { await optimizeImage(req.file.path, { maxWidth: 480 }); } catch (err) { console.error('[image optimize]', err); }
  }

  const { name, bio, what_selling, who_for, payout_ecocash_number, payout_bank_details } = req.body;
  const avatarPath = req.file ? `/uploads/${req.file.filename}` : req.creator.avatar_path;

  db.prepare(`
    UPDATE creators SET
      name = ?, bio = ?, what_selling = ?, who_for = ?, avatar_path = ?,
      payout_ecocash_number = ?, payout_bank_details = ?
    WHERE id = ?
  `).run(
    name ?? req.creator.name,
    bio ?? req.creator.bio,
    what_selling ?? req.creator.what_selling,
    who_for ?? req.creator.who_for,
    avatarPath,
    payout_ecocash_number ?? req.creator.payout_ecocash_number,
    payout_bank_details ? JSON.stringify(JSON.parse(payout_bank_details)) : req.creator.payout_bank_details,
    req.creator.id
  );

  checkAndUpdateVerification(req.creator.id);
  const creator = db.prepare('SELECT * FROM creators WHERE id = ?').get(req.creator.id);
  res.json(creator);
});

// GET /api/creators/me/verification-status — the checklist behind the Seal.
// Declared before /:handle so "me" doesn't get parsed as a handle.
router.get('/me/verification-status', requireAuth, (req, res) => {
  if (!req.creator) return res.status(404).json({ error: 'No creator profile yet.' });
  res.json({
    verified: !!req.creator.verified,
    verified_at: req.creator.verified_at,
    criteria: getVerificationCriteria(req.creator.id)
  });
});

// GET /api/creators — the "Meet the creators" directory. Verified sellers
// first (the ones actually worth leading with), then whoever has the most
// published products — a brand-new creator with zero listings would just
// be a dead-end card for a buyer clicking through, so they sort last
// rather than by signup recency. limit is the same homepage-rail pattern
// products.js uses (capped, optional).
router.get('/', (req, res) => {
  const capped = Math.min(parseInt(req.query.limit, 10) || 0, 100);
  const limitSql = capped > 0 ? ' LIMIT ?' : '';

  const creators = db.prepare(`
    SELECT c.id, c.handle, c.name, c.bio, c.avatar_path, c.verified, c.created_at,
           (SELECT COUNT(*) FROM products p WHERE p.creator_id = c.id AND p.status = 'published') AS product_count,
           (SELECT ROUND(AVG(pr.rating), 1) FROM product_reviews pr JOIN products p ON p.id = pr.product_id WHERE p.creator_id = c.id) AS avg_rating,
           (SELECT COUNT(*) FROM product_reviews pr JOIN products p ON p.id = pr.product_id WHERE p.creator_id = c.id) AS review_count
    FROM creators c
    WHERE (SELECT COUNT(*) FROM products p WHERE p.creator_id = c.id AND p.status = 'published') > 0
    ORDER BY c.verified DESC, product_count DESC, c.created_at DESC
    ${limitSql}
  `).all(...(capped > 0 ? [capped] : []));

  res.json(creators);
});

// GET /api/creators/:handle — public storefront data. Payout details never
// leave the server for anyone but the owner.
router.get('/:handle', (req, res) => {
  const creator = db.prepare('SELECT * FROM creators WHERE handle = ?').get(req.params.handle);
  if (!creator) return res.status(404).json({ error: 'Creator not found.' });

  const ratingAgg = db.prepare(`
    SELECT ROUND(AVG(pr.rating), 1) AS avg_rating, COUNT(*) AS review_count
    FROM product_reviews pr JOIN products p ON p.id = pr.product_id
    WHERE p.creator_id = ?
  `).get(creator.id);

  const products = db.prepare(`
    SELECT p.*,
           (SELECT COUNT(*) FROM product_likes WHERE product_id = p.id) AS like_count,
           (SELECT COUNT(*) FROM product_comments WHERE product_id = p.id) AS comment_count,
           (SELECT COUNT(*) FROM product_shares WHERE product_id = p.id) AS share_count,
           EXISTS(SELECT 1 FROM product_likes WHERE product_id = p.id AND user_id = ?) AS liked_by_me
    FROM products p
    WHERE p.creator_id = ? AND p.status = 'published'
    ORDER BY p.created_at DESC
  `).all(req.user ? req.user.id : 0, creator.id);

  res.json({ ...publicCreator(creator), avg_rating: ratingAgg.avg_rating, review_count: ratingAgg.review_count, products });
});

module.exports = router;
