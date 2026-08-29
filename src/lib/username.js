const db = require('../db/schema');

// Derives a unique username from an OAuth email/name when the provider
// doesn't give us one directly.
function generateUsername(base) {
  let candidate = String(base || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  if (candidate.length < 3) candidate = candidate.padEnd(3, '0');

  let final = candidate;
  let n = 0;
  while (db.prepare('SELECT id FROM users WHERE username = ?').get(final)) {
    n += 1;
    final = `${candidate}${n}`;
  }
  return final;
}

module.exports = { generateUsername };
