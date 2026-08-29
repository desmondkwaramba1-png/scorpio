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

const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many checkout attempts. Try again in a few minutes.' }
});

module.exports = { authLimiter, checkoutLimiter };
