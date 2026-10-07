const express = require('express');
const { randomBytes } = require('crypto');
const db = require('../db/schema');
const { createOrder, isValidSenderPhone } = require('../services/payment');
const { checkoutLimiter } = require('../middleware/rateLimit');
const { requireAuth, requireCreator } = require('../middleware/auth');
const { markPurchasePaid, markPurchaseFailed } = require('../lib/purchaseCompletion');
const { syncSubscriptionStatuses, cancelSubscription } = require('../lib/subscriptions');

const router = express.Router();

function daysRemaining(currentPeriodEnd) {
  const ms = new Date(currentPeriodEnd.replace(' ', 'T') + 'Z') - new Date();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

// GET /api/subscriptions/mine — a logged-in buyer's own subscriptions.
// syncSubscriptionStatuses() first, same lazy-on-request precedent
// GET /api/purchases/mine already follows for escrow, so this never
// reads a stale status even if the daily sweep hasn't run recently.
router.get('/mine', requireAuth, (req, res) => {
  syncSubscriptionStatuses();

  const rows = db.prepare(`
    SELECT s.*, p.title AS product_title, p.slug AS product_slug, p.cover_path AS product_cover_path,
           c.name AS creator_name, c.handle AS creator_handle
    FROM subscriptions s
    JOIN buyers b ON b.id = s.buyer_id
    JOIN products p ON p.id = s.product_id
    JOIN creators c ON c.id = s.creator_id
    WHERE b.user_id = ?
    ORDER BY s.created_at DESC
  `).all(req.user.id);

  const latestIssueStmt = db.prepare(
    'SELECT issue_number, title, published_at FROM issues WHERE product_id = ? ORDER BY issue_number DESC LIMIT 1'
  );
  const subscriptions = rows.map(s => {
    const days_remaining = daysRemaining(s.current_period_end);
    const renewable = s.status === 'lapsed' || (s.status === 'active' && !s.canceled_at && days_remaining <= 3);
    const latest_issue = latestIssueStmt.get(s.product_id) || null;
    return { ...s, days_remaining, renewable, latest_issue };
  });

  res.json(subscriptions);
});

// POST /api/subscriptions/:id/renew — the "month 2+" path. Amount is
// always subscription.price_minor, the price locked in when the buyer
// first subscribed, never client-supplied. Mirrors POST /api/purchases's
// free/paid branching exactly, so the response shape matches byte for
// byte and the frontend can reuse the existing /payment/return polling
// flow completely unmodified.
router.post('/:id/renew', checkoutLimiter, requireAuth, async (req, res) => {
  const { phone } = req.body;

  const subscription = db.prepare(`
    SELECT s.* FROM subscriptions s JOIN buyers b ON b.id = s.buyer_id
    WHERE s.id = ? AND b.user_id = ?
  `).get(req.params.id, req.user.id);
  if (!subscription) return res.status(404).json({ error: 'Subscription not found.' });

  // A canceled subscription isn't a renewal target — it was deliberately
  // ended, and this route existing to revive it would make "Cancel" a
  // lie. Resubscribing goes back through the normal product-page
  // checkout, the same door every first subscribe already uses.
  if (subscription.status === 'canceled') {
    return res.status(400).json({ error: 'This subscription was canceled. Subscribe again from the product page.' });
  }

  const isFree = subscription.price_minor === 0;
  if (!isFree) {
    if (!phone) return res.status(400).json({ error: 'phone is required.' });
    if (!isValidSenderPhone(phone)) {
      return res.status(400).json({ error: 'Enter a valid EcoCash number, e.g. 0780070488 or +263780070488.' });
    }
  }

  const insert = db.prepare(`
    INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_status, subscription_id)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(subscription.buyer_id, subscription.product_id, subscription.price_minor, subscription.currency, subscription.id);
  const purchaseId = insert.lastInsertRowid;

  if (isFree) {
    markPurchasePaid(purchaseId);
    return res.status(201).json({ free: true, purchase_id: purchaseId });
  }

  // zssub prefix (vs checkout's zs) only so the two are visually
  // distinguishable in the database — no other behavior depends on it.
  const orderId = `zssub${purchaseId}${randomBytes(4).toString('hex')}`;
  db.prepare('UPDATE purchases SET payment_reference = ? WHERE id = ?').run(orderId, purchaseId);

  const order = await createOrder({
    orderId, sender: phone, amountMinor: subscription.price_minor, currency: subscription.currency
  });

  if (!order.success && order.uncertain) {
    return res.status(201).json({
      order_id: orderId,
      ecocash_status: 'CHECKING',
      checking_payment_status: true
    });
  }

  if (!order.success) {
    markPurchaseFailed(purchaseId);
    return res.status(502).json({ error: order.error });
  }

  res.status(201).json({ order_id: orderId, ecocash_status: order.ecocashStatus });
});

// POST /api/subscriptions/:id/cancel — buyer-initiated only. Access
// continues until current_period_end; see cancelSubscription's own
// comment for why nothing here issues a refund.
router.post('/:id/cancel', requireAuth, (req, res) => {
  const subscription = db.prepare(`
    SELECT s.* FROM subscriptions s JOIN buyers b ON b.id = s.buyer_id
    WHERE s.id = ? AND b.user_id = ?
  `).get(req.params.id, req.user.id);
  if (!subscription) return res.status(404).json({ error: 'Subscription not found.' });

  const updated = cancelSubscription(subscription.id);
  if (!updated) return res.status(409).json({ error: 'This subscription is not currently active.' });

  res.json(updated);
});

// GET /api/subscriptions/creator — every subscription against the
// creator's own products, the "who's subscribed" view. ?product_id
// scopes it to one product, used by EditProduct.jsx's "View subscribers"
// link; omitted, it's the whole dashboard Subscriptions page.
router.get('/creator', requireAuth, requireCreator, (req, res) => {
  const productId = req.query.product_id ? Number(req.query.product_id) : null;

  const rows = db.prepare(`
    SELECT s.*, b.name AS buyer_name, b.email AS buyer_email,
           p.title AS product_title, p.slug AS product_slug
    FROM subscriptions s
    JOIN buyers b ON b.id = s.buyer_id
    JOIN products p ON p.id = s.product_id
    WHERE s.creator_id = ?${productId ? ' AND s.product_id = ?' : ''}
    ORDER BY s.created_at DESC
  `).all(...(productId ? [req.creator.id, productId] : [req.creator.id]));

  res.json(rows);
});

module.exports = router;
