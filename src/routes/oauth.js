const express = require('express');
const db = require('../db/schema');
const { buildAuthorizeUrl, exchangeCode, PROVIDERS, isConfigured } = require('../lib/oauth');
const { generateUsername } = require('../lib/username');
const { createSession, TTL_DAYS } = require('../lib/session');
const { COOKIE_NAME } = require('../middleware/auth');

const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TTL_DAYS * 24 * 60 * 60 * 1000
  };
}

const IDENTITY_COLUMN = { google: 'google_id', facebook: 'facebook_id' };

function findOrCreateUser(provider, profile) {
  const column = IDENTITY_COLUMN[provider];

  let user = db.prepare(`SELECT * FROM users WHERE ${column} = ?`).get(profile.providerId);
  if (user) return user;

  // Same email already registered a different way — link this provider to it
  // rather than creating a duplicate account.
  if (profile.email) {
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(profile.email);
    if (user) {
      db.prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).run(profile.providerId, user.id);
      return db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    }
  }

  const username = generateUsername(profile.email ? profile.email.split('@')[0] : profile.name);
  const result = db.prepare(`
    INSERT INTO users (username, email, name, avatar_url, email_verified_at, ${column})
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    username,
    profile.email || null,
    profile.name || null,
    profile.avatarUrl || null,
    profile.emailVerified ? new Date().toISOString() : null,
    profile.providerId
  );
  return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
}

// OAuth `state` has to survive a round trip through Google/Facebook's own
// servers as one opaque string, so both "which role" and "where to send
// them back" get packed into it together — there's nowhere else to carry
// a return path through that hop. base64url keeps it a single URL-safe
// token regardless of what characters are in the return path.
function encodeState(role, next) {
  return Buffer.from(JSON.stringify({ role, next: next || null })).toString('base64url');
}
function decodeState(state) {
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString());
    return { role: parsed.role === 'buyer' ? 'buyer' : 'creator', next: parsed.next || null };
  } catch {
    // Pre-existing links (or a tampered/garbage state param) had a plain
    // 'buyer'/'creator' string here — still honor those rather than
    // treating every unparseable state as an error.
    return { role: state === 'buyer' ? 'buyer' : 'creator', next: null };
  }
}

function registerProvider(provider) {
  // GET /api/auth/google or /api/auth/facebook — role (and where to
  // return the user afterward) is passed through as OAuth `state` so the
  // frontend knows where to route once control comes back.
  router.get(`/${provider}`, (req, res) => {
    const role = req.query.role === 'buyer' ? 'buyer' : 'creator';
    const next = typeof req.query.next === 'string' ? req.query.next : null;

    if (!isConfigured(provider)) {
      // Redirect back into the SPA instead of sending a raw text response —
      // a bare 503 page strands the user outside the app with only the
      // browser back button to recover. Login.jsx reads this query param.
      console.warn(`[oauth:${provider}] not configured — missing ${provider.toUpperCase()}_CLIENT credentials in .env`);
      const nextParam = next ? `&next=${encodeURIComponent(next)}` : '';
      return res.redirect(`${FRONTEND_URL}/login?oauth_error=not_configured&provider=${provider}${nextParam}`);
    }
    res.redirect(buildAuthorizeUrl(provider, encodeState(role, next)));
  });

  router.get(`/${provider}/callback`, async (req, res) => {
    const { code, state, error } = req.query;
    const { role, next } = decodeState(state);
    const nextParam = next ? `&next=${encodeURIComponent(next)}` : '';

    if (error || !code) {
      return res.redirect(`${FRONTEND_URL}/login?oauth_error=1${nextParam}`);
    }

    try {
      const accessToken = await exchangeCode(provider, code);
      const profile = await PROVIDERS[provider].fetchProfile(accessToken);
      const user = findOrCreateUser(provider, profile);

      const session = createSession(user.id);
      res.cookie(COOKIE_NAME, session.id, cookieOptions());
      res.redirect(`${FRONTEND_URL}/oauth-complete?role=${role}${nextParam}`);
    } catch (err) {
      console.error(`[oauth:${provider}]`, err.message);
      res.redirect(`${FRONTEND_URL}/login?oauth_error=1${nextParam}`);
    }
  });
}

registerProvider('google');
registerProvider('facebook');

module.exports = router;
