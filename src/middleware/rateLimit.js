const rateLimit = require('express-rate-limit');

// Auth and checkout are the two places abuse is cheapest to attempt and
// most expensive to allow — OTP spam runs up SMS cost, checkout spam can
// hammer the payment provider.
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' }
});

// Login gets a looser per-IP cap than the email-sending routes: mobile carriers
// put many real people behind one address, and guessing a single account is
// already stopped by the per-account lockout in lib/accountSecurity.js.
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts from your network. Try again in a few minutes.' }
});

const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many checkout attempts. Try again in a few minutes.' }
});

// order_id carries a 32-bit random suffix (see purchases.js), not a full
// token — enough to make guessing impractical under a rate limit, not
// enough to leave genuinely unthrottled. Without this, GET .../status/:id
// and the payment webhook were the one pair of endpoints in the app that
// took an ID-shaped guess with no cap on attempts at all.
const orderLookupLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again in a few minutes.' }
});

// ADMIN_KEY is the entire access control for /api/admin/* (see admin.js) —
// timingSafeEqual already closes the timing side-channel, this closes the
// brute-force one, so a leaked/weak key can't just be hammered forever.
const adminLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin requests. Try again in a few minutes.' }
});

// The general issue-report endpoint is deliberately open to logged-out
// visitors (see routes/reports.js — the whole point is catching "I can't
// log in"), which means it has no account behind it to rely on for abuse
// control the way the other report endpoints do.
const reportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reports sent. Try again in a few minutes.' }
});

// Password changes, session revocation and payout-destination edits are the
// actions an attacker with a stolen session would try; cap them separately
// from login so legitimate use never competes with them.
const accountSecurityLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: Number(process.env.ACCOUNT_SECURITY_RATE_LIMIT) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many security changes. Try again in a few minutes.' }
});

module.exports = { accountSecurityLimiter, loginLimiter, authLimiter, checkoutLimiter, reportLimiter, orderLookupLimiter, adminLimiter };
