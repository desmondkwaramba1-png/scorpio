const express = require('express');
const { randomBytes } = require('crypto');
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

// Ties a sign-in to the browser that started it. Without this, an attacker can
// send a victim their own callback link and quietly log them into the
// attacker's account.
const STATE_COOKIE = 'oauth_state';
function stateCookieOptions() {
  return { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 10 * 60 * 1000 };
}

// A return path must stay on this site: one leading slash, and no second slash
// or backslash that a browser would read as another host.
function safeNext(next) {
  return typeof next === 'string' && /^\/(?![/\\])/.test(next) ? next : null;
}

// Returns { user, isNew } — isNew is what lets the callback below decide
// whether this Google/Facebook sign-in needs to ask "buyer or seller?" at
// all. A returning user already has an answer (their creator profile, or
// lack of one); only a genuinely brand-new account has no answer yet.
function findOrCreateUser(provider, profile) {
  const column = IDENTITY_COLUMN[provider];

  let user = db.prepare(`SELECT * FROM users WHERE ${column} = ?`).get(profile.providerId);
  if (user) return { user, isNew: false };

  // Same email already registered a different way — link this provider to it
  // rather than creating a duplicate account.
  if (profile.email) {
    user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(profile.email);
    if (user) {
      // Linking gives this sign-in the whole account, so the provider has to
      // vouch for the address.
      if (!profile.emailVerified) {
        throw Object.assign(new Error('Provider email is not verified.'), { code: 'EMAIL_NOT_VERIFIED' });
      }
      db.transaction(() => {
        db.prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).run(profile.providerId, user.id);
        // An unverified account may have been opened by someone else using
        // this address, so the real owner's first verified sign-in removes
        // that password and every session it created.
        if (!user.email_verified_at) {
          db.prepare('UPDATE users SET password_hash = NULL, email_verified_at = ? WHERE id = ?')
            .run(new Date().toISOString(), user.id);
          db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
        }
      })();
      return { user: db.prepare('SELECT * FROM users WHERE id = ?').get(user.id), isNew: false };
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
  return { user: db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid), isNew: true };
}

// OAuth `state` has to survive a round trip through Google/Facebook's own
// servers as one opaque string, so both "which role" and "where to send
// them back" get packed into it together — there's nowhere else to carry
// a return path through that hop. base64url keeps it a single URL-safe
// token regardless of what characters are in the return path.
//
// role is null unless the buyer/seller choice was made explicitly (Login.jsx
// only sends one when the signup tab's role card was actually clicked) — it
// used to default to 'buyer' silently the moment someone clicked Google from
// the plain login tab, which meant a brand-new visitor could end up with a
// buyer-only account without ever having been asked. null here is what lets
// the callback below tell "explicitly chose buyer" apart from "never asked."
function encodeState(role, next, nonce) {
  return Buffer.from(JSON.stringify({ role: role || null, next: next || null, nonce })).toString('base64url');
}
function decodeState(state) {
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString());
    const role = parsed.role === 'buyer' || parsed.role === 'creator' ? parsed.role : null;
    return { role, next: safeNext(parsed.next), nonce: typeof parsed.nonce === 'string' ? parsed.nonce : null };
  } catch {
    return { role: null, next: null, nonce: null };
  }
}

function registerProvider(provider) {
  // GET /api/auth/google or /api/auth/facebook — role (and where to
  // return the user afterward) is passed through as OAuth `state` so the
  // frontend knows where to route once control comes back.
  router.get(`/${provider}`, (req, res) => {
    const role = req.query.role === 'buyer' || req.query.role === 'creator' ? req.query.role : null;
    const next = safeNext(req.query.next);

    if (!isConfigured(provider)) {
      // Redirect back into the SPA instead of sending a raw text response —
      // a bare 503 page strands the user outside the app with only the
      // browser back button to recover. Login.jsx reads this query param.
      console.warn(`[oauth:${provider}] not configured — missing ${provider.toUpperCase()}_CLIENT credentials in .env`);
      const nextParam = next ? `&next=${encodeURIComponent(next)}` : '';
      return res.redirect(`${FRONTEND_URL}/login?oauth_error=not_configured&provider=${provider}${nextParam}`);
    }
    const nonce = randomBytes(24).toString('hex');
    res.cookie(STATE_COOKIE, nonce, stateCookieOptions());
    res.redirect(buildAuthorizeUrl(provider, encodeState(role, next, nonce)));
  });

  router.get(`/${provider}/callback`, async (req, res) => {
    const { code, state, error } = req.query;
    const { role, next, nonce } = decodeState(state);
    const nextParam = next ? `&next=${encodeURIComponent(next)}` : '';
    const expectedNonce = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE);

    if (!nonce || !expectedNonce || nonce !== expectedNonce) {
      return res.redirect(`${FRONTEND_URL}/login?oauth_error=1${nextParam}`);
    }
    if (error || !code) {
      return res.redirect(`${FRONTEND_URL}/login?oauth_error=1${nextParam}`);
    }

    try {
      const accessToken = await exchangeCode(provider, code);
      const profile = await PROVIDERS[provider].fetchProfile(accessToken);
      const { user, isNew } = findOrCreateUser(provider, profile);

      const session = createSession(user.id);
      res.cookie(COOKIE_NAME, session.id, cookieOptions());
      const roleParam = role ? `&role=${role}` : '';
      const isNewParam = isNew ? '&is_new=1' : '';
      res.redirect(`${FRONTEND_URL}/oauth-complete?ok=1${roleParam}${isNewParam}${nextParam}`);
    } catch (err) {
      console.error(`[oauth:${provider}]`, err.message);
      const reason = err.code === 'EMAIL_NOT_VERIFIED' ? 'unverified' : '1';
      res.redirect(`${FRONTEND_URL}/login?oauth_error=${reason}${nextParam}`);
    }
  });
}

registerProvider('google');
registerProvider('facebook');

module.exports = router;
