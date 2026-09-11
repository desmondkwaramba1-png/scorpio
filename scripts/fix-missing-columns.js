/**
 * Emergency fix: production's `creators` table is missing `verified_at`,
 * even though migration 013_verification.sql — which adds exactly that
 * column — is recorded as already applied. The table itself must have
 * been recreated by something outside the migration system after 013 ran
 * (the migrations table only tracks "did this file run", not "does the
 * column still exist"), so the normal migration runner will never revisit
 * it — it thinks this is done.
 *
 * Every call to checkAndUpdateVerification() (creator onboarding, profile
 * edits, and now every completed purchase — see purchaseCompletion.js)
 * was crashing the whole Node process on `UPDATE creators SET verified_at
 * = ...`, which is why a purchase could fail entirely partway through:
 * the crash happened before the download token/email step ever ran.
 *
 *   node scripts/fix-missing-columns.js
 *
 * Safe to run any number of times, on any environment — checks for the
 * column first and does nothing if it's already there.
 */
const db = require('../src/db/schema');

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
}

let fixed = 0;

if (!hasColumn('creators', 'verified_at')) {
  db.exec('ALTER TABLE creators ADD COLUMN verified_at TEXT');
  console.log('Added creators.verified_at');
  fixed++;
} else {
  console.log('creators.verified_at already present — nothing to do.');
}

console.log(fixed > 0 ? `Fixed ${fixed} missing column(s).` : 'Schema already correct.');
