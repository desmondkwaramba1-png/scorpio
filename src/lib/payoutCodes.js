const { createHash, randomInt, timingSafeEqual } = require('crypto');
const db = require('../db/schema');

const TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function hashCode(userId, code) {
  return createHash('sha256').update(`${userId}:${code}`).digest('hex');
}

// Issues a fresh 6-digit code, replacing any earlier one for this user.
function issuePayoutCode(userId) {
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  db.prepare('DELETE FROM payout_change_codes WHERE user_id = ?').run(userId);
  db.prepare('INSERT INTO payout_change_codes (user_id, code_hash, expires_at) VALUES (?, ?, ?)')
    .run(userId, hashCode(userId, code), new Date(Date.now() + TTL_MINUTES * 60 * 1000).toISOString());
  return code;
}

// True once, for the right unexpired code. Wrong guesses are counted and the
// code dies after MAX_ATTEMPTS so six digits cannot be brute-forced.
function consumePayoutCode(userId, candidate) {
  if (typeof candidate !== 'string' || !/^\d{6}$/.test(candidate.trim())) return false;
  const row = db.prepare(
    'SELECT * FROM payout_change_codes WHERE user_id = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1'
  ).get(userId);
  if (!row || row.attempts >= MAX_ATTEMPTS || new Date(row.expires_at) < new Date()) return false;

  const expected = Buffer.from(row.code_hash, 'hex');
  const given = Buffer.from(hashCode(userId, candidate.trim()), 'hex');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    db.prepare('UPDATE payout_change_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    return false;
  }
  db.prepare("UPDATE payout_change_codes SET consumed_at = datetime('now') WHERE id = ?").run(row.id);
  return true;
}

module.exports = { issuePayoutCode, consumePayoutCode, TTL_MINUTES };
