const bcrypt = require('bcryptjs');

// Failed-login throttle per (client IP + account identifier). The route-level
// IP limiter caps raw volume; this stops slow, targeted guessing at one
// account from a single address. Keyed on IP too so a stranger cannot lock the
// real owner out of their own account. In-memory is deliberate: the API runs
// as exactly one machine (see fly.toml), and a restart only resets counters.
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map();

function keyFor(ip, identifier) {
  return `${ip}|${String(identifier || '').trim().toLowerCase()}`;
}

function sweep(now) {
  if (attempts.size < 5000) return;
  for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
}

// Minutes left on a lockout, or 0 if the caller may try.
function loginLockedFor(ip, identifier, now = Date.now()) {
  const entry = attempts.get(keyFor(ip, identifier));
  if (!entry || entry.until <= now) return 0;
  return entry.count >= MAX_FAILURES ? Math.ceil((entry.until - now) / 60000) : 0;
}

function recordLoginFailure(ip, identifier, now = Date.now()) {
  sweep(now);
  const key = keyFor(ip, identifier);
  const entry = attempts.get(key);
  if (!entry || entry.until <= now) attempts.set(key, { count: 1, until: now + WINDOW_MS });
  else entry.count += 1;
}

function clearLoginFailures(ip, identifier) {
  attempts.delete(keyFor(ip, identifier));
}

function passwordMatches(user, candidate) {
  if (!user?.password_hash || typeof candidate !== 'string' || !candidate) return false;
  return bcrypt.compareSync(candidate, user.password_hash);
}

// Returns an error string, or null if the password is acceptable.
function passwordProblem(password, user) {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 200) return 'Password is too long.';
  const lower = password.toLowerCase();
  if (user?.username && lower === user.username.toLowerCase()) return "Password can't be the same as your username.";
  if (user?.email && lower === user.email.toLowerCase()) return "Password can't be the same as your email.";
  if (/^(.)\1+$/.test(password)) return 'Choose a password with more variety.';
  return null;
}

module.exports = {
  loginLockedFor, recordLoginFailure, clearLoginFailures, passwordMatches, passwordProblem, MAX_FAILURES
};
