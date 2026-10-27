const db = require('../db/schema');

// Rows that are only ever useful until they expire. Nothing else deletes them,
// so without this the tables just grow (and expired credentials linger).
const EXPIRING = [
  ['sessions', 'expires_at'],
  ['email_verification_tokens', 'expires_at'],
  ['password_reset_tokens', 'expires_at'],
  ['payout_change_codes', 'expires_at'],
  ['product_upload_tokens', 'expires_at']
];

function purgeExpired() {
  const now = new Date().toISOString();
  let removed = 0;
  for (const [table, column] of EXPIRING) {
    try {
      removed += db.prepare(`DELETE FROM ${table} WHERE julianday(${column}) < julianday(?)`).run(now).changes;
    } catch (err) {
      console.error('[housekeeping]', table, err.message);
    }
  }
  return removed;
}

function startHousekeeping(intervalMs = 60 * 60 * 1000) {
  purgeExpired();
  const timer = setInterval(purgeExpired, intervalMs);
  timer.unref();
  return timer;
}

module.exports = { purgeExpired, startHousekeeping };
