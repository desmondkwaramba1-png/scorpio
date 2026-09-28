const db = require('../db/schema');

function linkGuestPurchases(user) {
  if (!user?.id || !user.email || !user.email_verified_at) return 0;

  return db.prepare(`
    UPDATE buyers
    SET user_id = ?
    WHERE user_id IS NULL AND lower(trim(email)) = lower(trim(?))
  `).run(user.id, user.email).changes;
}

module.exports = { linkGuestPurchases };