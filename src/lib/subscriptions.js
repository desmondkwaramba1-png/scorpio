const db = require('../db/schema');
const { sendEmail } = require('./notify');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// How long a subscription period runs. Flat 30 days, not calendar-month
// aware — same style as escrow.js's flat AUTO_RELEASE_DAYS window, not a
// real calendar-math dependency this app doesn't otherwise have.
const PERIOD_DAYS = 30;
// How far ahead of expiry the "renews soon" reminder goes out.
const REMINDER_WINDOW_DAYS = 3;

// Lazy sweep, no email — same "no background worker, so time passing is
// only noticed when something reads state" reasoning as escrow.js's
// sweepAutoReleases(). Safe to call from any hot route whose response
// depends on subscription status. Split into two UPDATEs so a buyer who
// canceled reads "canceled" once their period actually ends, not
// "lapsed" — the same underlying fact (access has run out), but
// "canceled" is what they chose and "lapsed" is what happens when nobody
// did anything.
function syncSubscriptionStatuses() {
  db.prepare(`
    UPDATE subscriptions SET status = 'canceled'
    WHERE status = 'active' AND canceled_at IS NOT NULL AND current_period_end <= datetime('now')
  `).run();
  db.prepare(`
    UPDATE subscriptions SET status = 'lapsed'
    WHERE status = 'active' AND canceled_at IS NULL AND current_period_end <= datetime('now')
  `).run();
}

// One row per (buyer, product) for the whole relationship's lifetime —
// called from purchaseCompletion.js every time a subscription-product
// purchase clears, first-ever or a later renewal alike. Reactivating an
// existing (lapsed or canceled) row resets both idempotency flags to
// NULL, so a resubscribe genuinely starts the reminder/lapse cycle over
// rather than inheriting whatever was already sent for the old period.
function findOrCreateSubscription({ buyerId, creatorId, productId, priceMinor, currency }) {
  const existing = db.prepare('SELECT * FROM subscriptions WHERE buyer_id = ? AND product_id = ?').get(buyerId, productId);

  if (!existing) {
    const result = db.prepare(`
      INSERT INTO subscriptions
        (buyer_id, creator_id, product_id, status, price_minor, currency, current_period_start, current_period_end)
      VALUES (?, ?, ?, 'active', ?, ?, datetime('now'), datetime('now', '+${PERIOD_DAYS} days'))
    `).run(buyerId, creatorId, productId, priceMinor, currency);
    return { subscription: db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(result.lastInsertRowid), isNew: true };
  }

  db.prepare(`
    UPDATE subscriptions SET
      status = 'active', canceled_at = NULL, price_minor = ?, currency = ?,
      current_period_start = datetime('now'), current_period_end = datetime('now', '+${PERIOD_DAYS} days'),
      reminder_sent_at = NULL, lapse_notice_sent_at = NULL
    WHERE id = ?
  `).run(priceMinor, currency, existing.id);
  return { subscription: db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(existing.id), isNew: false };
}

// Buyer-initiated only. Access continues until current_period_end — no
// partial refund, same honesty as escrow.js's resolveDispute: nothing
// here pretends money physically moved that didn't.
function cancelSubscription(subscriptionId) {
  const result = db.prepare(`
    UPDATE subscriptions SET canceled_at = datetime('now')
    WHERE id = ? AND status = 'active' AND canceled_at IS NULL
  `).run(subscriptionId);
  if (result.changes === 0) return null;
  return db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subscriptionId);
}

// The only function in this file that sends email — called exclusively
// from the admin-triggered sweep route (see admin.js), never from a page
// load, so a buyer opening their own account page can't trigger a
// duplicate reminder. See 032_subscriptions.sql's comment on why this
// uses two separate idempotency columns instead of one doing double duty.
function sendRenewalReminders() {
  syncSubscriptionStatuses();

  let remindersSent = 0;
  const dueSoon = db.prepare(`
    SELECT s.id, b.email, p.title, p.slug, c.handle
    FROM subscriptions s
    JOIN buyers b ON b.id = s.buyer_id
    JOIN products p ON p.id = s.product_id
    JOIN creators c ON c.id = s.creator_id
    WHERE s.status = 'active' AND s.canceled_at IS NULL
      AND s.current_period_end <= datetime('now', '+${REMINDER_WINDOW_DAYS} days')
      AND s.reminder_sent_at IS NULL
  `).all();
  for (const row of dueSoon) {
    sendEmail(
      row.email,
      `Your subscription to ${row.title} renews soon`,
      `Your subscription renews in the next few days. EcoCash can't auto-charge, so this needs one tap from you: ${FRONTEND_URL}/account`
    );
    db.prepare("UPDATE subscriptions SET reminder_sent_at = datetime('now') WHERE id = ?").run(row.id);
    remindersSent++;
  }

  let lapseNoticesSent = 0;
  const lapsed = db.prepare(`
    SELECT s.id, b.email, p.title, p.slug, c.handle
    FROM subscriptions s
    JOIN buyers b ON b.id = s.buyer_id
    JOIN products p ON p.id = s.product_id
    JOIN creators c ON c.id = s.creator_id
    WHERE s.status = 'lapsed' AND s.lapse_notice_sent_at IS NULL
  `).all();
  for (const row of lapsed) {
    sendEmail(
      row.email,
      `Your subscription to ${row.title} has lapsed`,
      `Your subscription to ${row.title} wasn't renewed in time, so new issues are on hold until you renew: ${FRONTEND_URL}/account`
    );
    db.prepare("UPDATE subscriptions SET lapse_notice_sent_at = datetime('now') WHERE id = ?").run(row.id);
    lapseNoticesSent++;
  }

  return { reminders_sent: remindersSent, lapse_notices_sent: lapseNoticesSent };
}

module.exports = {
  PERIOD_DAYS, syncSubscriptionStatuses, findOrCreateSubscription, cancelSubscription, sendRenewalReminders
};
