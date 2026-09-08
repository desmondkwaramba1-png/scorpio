const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../db/schema');
const { sendEmail } = require('../lib/notify');
const { generateToken } = require('../lib/tokens');
const { createSession, destroySession, TTL_DAYS } = require('../lib/session');
const { requireAuth, COOKIE_NAME } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const { checkAndUpdateVerification } = require('../lib/verification');
const { UPLOADS_DIR } = require('../lib/paths');

const router = express.Router();

// Uploads are served back out as static files (see /uploads in server.js)
// with whatever content-type the extension implies — an unrestricted
// upload here means anyone could host an .html or .svg-with-a-script-tag
// off this domain. A profile photo has one legitimate shape; enforce it.
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
function imageFileFilter(req, file, cb) {
  if (IMAGE_TYPES.has(file.mimetype)) return cb(null, true);
  cb(new Error('That file must be an image (JPEG, PNG, WebP, or GIF).'));
}

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `avatar-${randomUUID()}${ext}`);
    }
  }),
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB, this is a profile photo, not a product file
});

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const EMAIL_TOKEN_TTL_HOURS = parseInt(process.env.EMAIL_TOKEN_TTL_HOURS || '24', 10);
const RESET_TOKEN_TTL_MINUTES = parseInt(process.env.RESET_TOKEN_TTL_MINUTES || '15', 10);

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TTL_DAYS * 24 * 60 * 60 * 1000
  };
}

function publicUser(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user;
  return rest;
}

function futureTimestamp(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString();
}

// POST /api/auth/signup
router.post('/signup', authLimiter, (req, res) => {
  const { username, email, phone, password, terms_accepted } = req.body;

  if (!username || !email || !phone || !password) {
    return res.status(400).json({ error: 'username, email, phone, and password are all required.' });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 3 to 24 characters: letters, numbers, underscores only.' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (!terms_accepted) {
    return res.status(400).json({ error: 'You must agree to the Terms to create an account.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ? OR phone = ?')
    .get(username, email, phone);
  if (existing) {
    return res.status(409).json({ error: 'That username, email, or phone is already registered.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    "INSERT INTO users (username, email, phone, password_hash, terms_accepted_at) VALUES (?, ?, ?, ?, datetime('now'))"
  ).run(username, email, phone, passwordHash);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

  const token = generateToken();
  db.prepare(
    'INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (?, ?, ?)'
  ).run(user.id, token, futureTimestamp(EMAIL_TOKEN_TTL_HOURS * 60));
  sendEmail(
    email,
    'Verify your SCORPIO account',
    `Welcome to SCORPIO. Verify your email: ${FRONTEND_URL}/verify-email?token=${token}`
  );

  const session = createSession(user.id);
  res.cookie(COOKIE_NAME, session.id, cookieOptions());
  res.status(201).json({ user: publicUser(user), creator: null });
});

// POST /api/auth/login — identifier is a username or an email.
router.post('/login', authLimiter, (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Enter your username or email and your password.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(identifier, identifier);
  if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'That username/email or password is incorrect.' });
  }

  const session = createSession(user.id);
  res.cookie(COOKIE_NAME, session.id, cookieOptions());
  const creator = db.prepare('SELECT * FROM creators WHERE user_id = ?').get(user.id);
  res.json({ user: publicUser(user), creator: creator || null });
});

router.post('/logout', (req, res) => {
  const sessionId = req.cookies?.[COOKIE_NAME];
  if (sessionId) destroySession(sessionId);
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

// POST /api/auth/verify-email — a POST triggered by the verify-email page's
// own fetch call, not a bare link click. Email link-scanners auto-GET links
// before a human ever clicks; a GET endpoint here would let a scanner burn
// the one-time token before the real user arrives.
router.post('/verify-email', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token is required.' });

  const row = db.prepare(
    'SELECT * FROM email_verification_tokens WHERE token = ? AND consumed_at IS NULL'
  ).get(token);
  if (!row || new Date(row.expires_at) < new Date()) {
    return res.status(400).json({ error: 'That verification link is invalid or has expired.' });
  }

  db.prepare("UPDATE users SET email_verified_at = datetime('now') WHERE id = ?").run(row.user_id);
  db.prepare("UPDATE email_verification_tokens SET consumed_at = datetime('now') WHERE id = ?").run(row.id);

  const creator = db.prepare('SELECT id FROM creators WHERE user_id = ?').get(row.user_id);
  if (creator) checkAndUpdateVerification(creator.id);

  res.json({ verified: true });
});

// POST /api/auth/forgot-password — always responds { sent: true } regardless
// of whether the account exists, so this endpoint can't be used to check
// which usernames/emails are registered.
router.post('/forgot-password', authLimiter, (req, res) => {
  const { identifier } = req.body;
  if (!identifier) {
    return res.status(400).json({ error: 'identifier is required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(identifier, identifier);

  if (user) {
    const token = generateToken();
    db.prepare(
      'INSERT INTO password_reset_tokens (user_id, method, token, expires_at) VALUES (?, ?, ?, ?)'
    ).run(user.id, 'email', token, futureTimestamp(RESET_TOKEN_TTL_MINUTES));
    sendEmail(
      user.email,
      'Reset your SCORPIO password',
      `Reset your password: ${FRONTEND_URL}/reset-password?token=${token}`
    );
  }

  res.json({ sent: true });
});

// POST /api/auth/reset-password — token is either the emailed link token or
// the WhatsApp-delivered code; both live in the same table.
router.post('/reset-password', authLimiter, (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'token and password are required.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const row = db.prepare(
    'SELECT * FROM password_reset_tokens WHERE token = ? AND consumed_at IS NULL'
  ).get(token);
  if (!row || new Date(row.expires_at) < new Date()) {
    return res.status(400).json({ error: 'That reset code or link is invalid or has expired.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, row.user_id);
  db.prepare("UPDATE password_reset_tokens SET consumed_at = datetime('now') WHERE user_id = ? AND consumed_at IS NULL")
    .run(row.user_id);

  res.json({ ok: true });
});

// POST /api/auth/accept-terms — the gate for accounts that never saw the
// signup checkbox (Google/Facebook sign-in skips the form entirely).
router.post('/accept-terms', requireAuth, (req, res) => {
  db.prepare("UPDATE users SET terms_accepted_at = datetime('now') WHERE id = ?").run(req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(user) });
});

// PATCH /api/auth/me — lets any logged-in user (buyer or creator) set their
// own profile photo. Separate from PATCH /api/creators/me, which only
// exists for users who've completed creator onboarding — every account
// should be able to add a photo, not just sellers.
router.patch('/me', requireAuth, avatarUpload.single('avatar'), (req, res) => {
  const avatarUrl = req.file ? `/uploads/${req.file.filename}` : req.user.avatar_url;
  const { name } = req.body;

  db.prepare('UPDATE users SET avatar_url = ?, name = ? WHERE id = ?')
    .run(avatarUrl, name ?? req.user.name, req.user.id);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(user) });
});

// GET /api/auth/me — "who am I", called on every page load. Not auth-gated:
// an anonymous visitor is a normal case (user/creator come back null), not
// an error.
router.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user), creator: req.creator });
});

module.exports = router;
