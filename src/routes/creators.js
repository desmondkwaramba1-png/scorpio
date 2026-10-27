const express = require('express');
const multer = require('multer');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { accountSecurityLimiter } = require('../middleware/rateLimit');
const { passwordMatches } = require('../lib/accountSecurity');
const { isValidEcocashNumber } = require('../services/payment');
const { sendEmail } = require('../lib/notify');
const { issuePayoutCode, consumePayoutCode, TTL_MINUTES } = require('../lib/payoutCodes');
const { getVerificationCriteria, checkAndUpdateVerification } = require('../lib/verification');
const { optimizeImage } = require('../lib/imageProcessing');
const storage = require('../lib/storage');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB, this is a profile photo, not a product file
});

async function uploadAvatar(file) {
  const key = `avatars/${randomUUID()}${path.extname(file.originalname)}`;
  let buffer = file.buffer;
  try { buffer = await optimizeImage(file.buffer, { maxWidth: 480, enhance: true }); } catch (err) { console.error('[image optimize]', err); }
  await storage.uploadBuffer(key, buffer, file.mimetype);
  return storage.publicUrl(key);
}

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;

// Every top-level static route in App.jsx — a creator whose handle matches
// one of these would have a storefront permanently unreachable at /:handle
// (the static route always wins), silently. Same list has to be kept in
// sync with App.jsx's routes by hand since there's no shared source of
// truth between the two; worth a quick check if a new top-level route is
// ever added there.
const RESERVED_HANDLES = new Set([
  'discover', 'login', 'oauth-complete', 'forgot-password', 'reset-password',
  'verify-email', 'check-email', 'terms', 'accept-terms', 'onboarding', 'account', 'cart',
  'checkout', 'dashboard', 'creators', 'payment', 'report', 'privacy', 'reels',
  'blog', 'admin'
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

  try {
    const avatarPath = req.file ? await uploadAvatar(req.file) : null;
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
router.patch('/me', accountSecurityLimiter, requireAuth, upload.single('avatar'), async (req, res) => {
  if (!req.creator) return res.status(404).json({ error: 'No creator profile yet.' });

  // The payout number decides where earnings are sent, so changing it is the
  // single most valuable thing a hijacked session could do. It needs the
  // account password (and a verified email for accounts without one), is
  // format-checked, and the account owner is emailed about it.
  const squash = value => String(value ?? '').replace(/[\s-]+/g, '');
  const requestedPayout = req.body.payout_ecocash_number === undefined ? undefined : squash(req.body.payout_ecocash_number);
  const payoutChanging = requestedPayout !== undefined && requestedPayout !== squash(req.creator.payout_ecocash_number);
  if (payoutChanging) {
    if (requestedPayout && !isValidEcocashNumber(requestedPayout)) {
      return res.status(400).json({ error: 'Enter a valid EcoCash number, e.g. 0771234567 or +263771234567.' });
    }
    // Proof it's really the owner: the password, or a one-time code emailed
    // to the account. Google/Facebook accounts have no password to give, so
    // for them the emailed code is the only route.
    if (!req.user.email_verified_at) {
      return res.status(403).json({ error: 'Verify your email before changing your payout number.' });
    }
    const hasPassword = !!req.user.password_hash;
    const passwordOk = hasPassword && passwordMatches(req.user, req.body.current_password);
    if (!passwordOk && !consumePayoutCode(req.user.id, req.body.payout_code)) {
      return res.status(403).json({
        error: hasPassword
          ? 'Enter your password, or the 6-digit code we emailed you, to change your payout number.'
          : 'Enter the 6-digit code we emailed you to change your payout number.',
        code: 'REAUTH_REQUIRED',
        methods: hasPassword ? ['password', 'email_code'] : ['email_code']
      });
    }
  }

  const { name, bio, what_selling, who_for, payout_ecocash_number, payout_bank_details } = req.body;
  // Express 4 doesn't route a rejected promise to the error middleware on
  // its own (that's Express 5 behavior) - an unguarded await here that
  // rejects (a real R2 network hiccup, not hypothetical) used to leave the
  // request hanging forever instead of responding with an error, since
  // nothing ever caught it. Every other write in this file already wraps
  // its own uploadAvatar() call for exactly this reason (see POST / just
  // above) - this one didn't.
  let avatarPath;
  try {
    avatarPath = req.file ? await uploadAvatar(req.file) : req.creator.avatar_path;
  } catch (err) {
    return res.status(502).json({ error: 'Could not upload that photo, try again.' });
  }

  db.prepare(`
    UPDATE creators SET
      name = ?, bio = ?, what_selling = ?, who_for = ?, avatar_path = ?,
      payout_ecocash_number = ?, payout_bank_details = ?,
      payout_changed_at = CASE WHEN ? THEN datetime('now') ELSE payout_changed_at END
    WHERE id = ?
  `).run(
    name ?? req.creator.name,
    bio ?? req.creator.bio,
    what_selling ?? req.creator.what_selling,
    who_for ?? req.creator.who_for,
    avatarPath,
    payoutChanging ? (requestedPayout || null) : req.creator.payout_ecocash_number,
    payout_bank_details ? JSON.stringify(JSON.parse(payout_bank_details)) : req.creator.payout_bank_details,
    payoutChanging ? 1 : 0,
    req.creator.id
  );
  if (payoutChanging) {
    sendEmail(
      req.user.email,
      'Your SCORPIO payout number was changed',
      `The payout number on your SCORPIO seller account was just changed. Payouts to a new number are reviewed before they are sent. If this wasn't you, reset your password immediately: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/forgot-password`
    );
  }

  checkAndUpdateVerification(req.creator.id);
  const creator = db.prepare('SELECT * FROM creators WHERE id = ?').get(req.creator.id);
  res.json(creator);
});

// POST /api/creators/me/payout-code: emails a one-time code that authorises
// a payout-number change. Rate limited, and each new code replaces the last.
router.post('/me/payout-code', accountSecurityLimiter, requireAuth, (req, res) => {
  if (!req.creator) return res.status(404).json({ error: 'No creator profile yet.' });
  if (!req.user.email_verified_at) {
    return res.status(403).json({ error: 'Verify your email first so we can send you the code.' });
  }
  const code = issuePayoutCode(req.user.id);
  sendEmail(
    req.user.email,
    'Your SCORPIO payout confirmation code',
    `Your code to confirm a payout number change is ${code}. It expires in ${TTL_MINUTES} minutes. If you didn't ask for this, ignore this email and consider changing your password. Never share this code with anyone.`
  );
  res.json({ sent: true, expires_in_minutes: TTL_MINUTES });
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
           EXISTS(SELECT 1 FROM product_likes WHERE product_id = p.id AND user_id = ?) AS liked_by_me,
           EXISTS(SELECT 1 FROM cart_items WHERE product_id = p.id AND user_id = ?) AS in_cart
    FROM products p
    WHERE p.creator_id = ? AND p.status = 'published'
    ORDER BY p.created_at DESC
  `).all(req.user ? req.user.id : 0, req.user ? req.user.id : 0, creator.id);

  res.json({ ...publicCreator(creator), avg_rating: ratingAgg.avg_rating, review_count: ratingAgg.review_count, products });
});

module.exports = router;
