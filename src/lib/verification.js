const db = require('../db/schema');

// The Seal is earned automatically, not granted by a human reviewer — these
// four checks are the whole policy, and every one of them is a real signal
// already sitting in the database (nothing here is fabricated to make a
// creator look more credible than they are):
//   1. Email verified          — they own the address on file
//   2. EcoCash number on file  — they're actually payable
//   3. At least one published product — they're really selling something
//   4. At least one paid order — a real transaction has gone through
// Verification is one-directional: once earned it isn't revoked if a
// creator later unpublishes a product, same as most "verified" badges.
function getVerificationCriteria(creatorId) {
  const creator = db.prepare('SELECT * FROM creators WHERE id = ?').get(creatorId);
  if (!creator) return null;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(creator.user_id);

  const publishedCount = db.prepare(
    "SELECT COUNT(*) AS n FROM products WHERE creator_id = ? AND status = 'published'"
  ).get(creatorId).n;

  const paidOrderCount = db.prepare(`
    SELECT COUNT(*) AS n FROM purchases pu
    JOIN products p ON p.id = pu.product_id
    WHERE p.creator_id = ? AND pu.payment_status = 'paid'
  `).get(creatorId).n;

  return {
    email_verified: !!(user && user.email_verified_at),
    payout_added: !!creator.payout_ecocash_number,
    has_published_product: publishedCount > 0,
    has_paid_sale: paidOrderCount > 0
  };
}

// Call after anything that could complete the criteria: a purchase pays out,
// a creator adds payout details, a product gets published, an email gets
// verified. No-ops once already verified.
function checkAndUpdateVerification(creatorId) {
  const creator = db.prepare('SELECT verified FROM creators WHERE id = ?').get(creatorId);
  if (!creator || creator.verified) return;

  const criteria = getVerificationCriteria(creatorId);
  if (criteria && Object.values(criteria).every(Boolean)) {
    db.prepare("UPDATE creators SET verified = 1, verified_at = datetime('now') WHERE id = ?").run(creatorId);
  }
}

module.exports = { getVerificationCriteria, checkAndUpdateVerification };
