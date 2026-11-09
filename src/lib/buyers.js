const db = require('../db/schema');

// Returned when an unverified account's email matches an existing buyer row.
const VERIFY_FIRST = Symbol('verify-first');

// The buyer record for a checkout is always derived from the logged-in
// account, never from an email typed into the request body. Trusting the
// body let any account claim an unlinked (legacy guest) buyer row just by
// naming its email, which surfaced that person's paid purchases and download
// links in the attacker's library.
//
// Buyers may pay before verifying their email. Until they verify, they never
// take over an existing row by email: they get one of their own, and only a
// verified address can claim a row someone else's guest checkout created.
function buyerForUser(user, name) {
  const linked = db.prepare('SELECT * FROM buyers WHERE user_id = ? ORDER BY id LIMIT 1').get(user.id);
  if (linked) return linked;

  const byEmail = db.prepare('SELECT * FROM buyers WHERE lower(trim(email)) = lower(trim(?))').get(user.email);
  if (byEmail) {
    if (byEmail.user_id && byEmail.user_id !== user.id) return null;
    if (!user.email_verified_at) return VERIFY_FIRST;
    db.prepare('UPDATE buyers SET user_id = ? WHERE id = ?').run(user.id, byEmail.id);
    return { ...byEmail, user_id: user.id };
  }

  const result = db.prepare('INSERT INTO buyers (name, email, user_id) VALUES (?, ?, ?)')
    .run(name || null, user.email, user.id);
  return db.prepare('SELECT * FROM buyers WHERE id = ?').get(result.lastInsertRowid);
}

module.exports = { buyerForUser, VERIFY_FIRST };
