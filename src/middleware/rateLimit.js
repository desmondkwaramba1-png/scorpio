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
// Only wrong keys count, and the right key is never blocked: this exists to stop
// guessing, so someone guessing from a shared proxy address must not be able to
// lock the real admin out. Required here because routes/admin.js loads this file.
const adminLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  skip: req => require('../routes/admin').isValidAdminKey(req.headers['x-admin-key']),
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

// Signed-in actions are limited per account, not per address, so people who
// share a carrier or proxy address never use up each other's allowance.
const perAccountKey = req => (req.user ? `user:${req.user.id}` : req.ip);

// Comments, likes and other things that write public content.
const engagementLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  keyGenerator: perAccountKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'You are doing that a lot. Try again in a few minutes.' }
});

// Order and product reports from signed-in users.
const accountReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: perAccountKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reports sent. Try again later.' }
});

// Share clicks and reel views are anonymous counters. Past the cap the request
// still succeeds, it just stops counting, so a real visitor never sees an error.
const counterLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.json({ ok: true, counted: false })
});

module.exports = { engagementLimiter, accountReportLimiter, counterLimiter, accountSecurityLimiter, loginLimiter, authLimiter, checkoutLimiter, reportLimiter, orderLookupLimiter, adminLimiter };
