const express = require('express');
const db = require('../db/schema');
const { requireAuth, requireCreator } = require('../middleware/auth');
const { sweepAutoReleases } = require('../lib/escrow');
const { netOf } = require('../lib/fees');

const router = express.Router();

// GET /api/insights/me — built entirely from real purchase rows. No view
// tracking exists yet, so this reports orders and revenue, not traffic —
// nothing here is a placeholder number.
router.get('/me', requireAuth, requireCreator, (req, res) => {
  sweepAutoReleases();
  const creatorId = req.creator.id;

  const totals = db.prepare(`
    SELECT COUNT(*) AS order_count, COALESCE(SUM(pu.amount_minor), 0) AS revenue_minor
    FROM purchases pu
    JOIN products p ON p.id = pu.product_id
    WHERE p.creator_id = ? AND pu.payment_status = 'paid'
  `).get(creatorId);

  // Same "held vs actually yours" split as wallet.js — a service order
  // that's paid but not yet released shouldn't read as spendable revenue
  // on the very first thing a seller sees when they log in.
  const escrowed = db.prepare(`
    SELECT COALESCE(SUM(pu.amount_minor), 0) AS n FROM purchases pu
    JOIN products p ON p.id = pu.product_id
    WHERE p.creator_id = ? AND pu.payment_status = 'paid'
      AND pu.fulfillment_status IS NOT NULL AND pu.fulfillment_status NOT IN ('released', 'refunded')
  `).get(creatorId).n;
  const availableGross = totals.revenue_minor - escrowed;
  const availableMinor = availableGross > 0 ? netOf(availableGross).net_minor : 0;

  const awaitingActionCount = db.prepare(`
    SELECT COUNT(*) AS n FROM purchases pu
    JOIN products p ON p.id = pu.product_id
    WHERE p.creator_id = ? AND pu.payment_status = 'paid' AND pu.fulfillment_status = 'awaiting_delivery'
  `).get(creatorId).n;

  const revenueByDay = db.prepare(`
    SELECT date(pu.created_at) AS day, COALESCE(SUM(pu.amount_minor), 0) AS revenue_minor, COUNT(*) AS orders
    FROM purchases pu
    JOIN products p ON p.id = pu.product_id
    WHERE p.creator_id = ? AND pu.payment_status = 'paid'
    GROUP BY day ORDER BY day ASC
  `).all(creatorId);

  const topProducts = db.prepare(`
    SELECT p.id, p.title, p.slug, COUNT(*) AS order_count, COALESCE(SUM(pu.amount_minor), 0) AS revenue_minor
    FROM purchases pu
    JOIN products p ON p.id = pu.product_id
    WHERE p.creator_id = ? AND pu.payment_status = 'paid'
    GROUP BY p.id ORDER BY revenue_minor DESC LIMIT 5
  `).all(creatorId);

  const productCounts = db.prepare(`
    SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published
    FROM products WHERE creator_id = ?
  `).get(creatorId);

  res.json({
    currency: 'USD',
    order_count: totals.order_count,
    revenue_minor: totals.revenue_minor,
    available_minor: availableMinor,
    escrowed_minor: escrowed,
    awaiting_action_count: awaitingActionCount,
    revenue_by_day: revenueByDay,
    top_products: topProducts,
    product_count: productCounts.total,
    published_count: productCounts.published || 0
  });
});

// GET /api/insights/orders — the buyer-relationship view: who bought what,
// with contact info a creator can actually message ("launched something
// new? here's who already trusts you enough to have bought before"). Phone
// comes from the buyer's own account (users.phone), not the one-off
// checkout-time sender number, which is never stored — a buyer's real
// account phone is the one worth messaging.
router.get('/orders', requireAuth, requireCreator, (req, res) => {
  sweepAutoReleases();
  const creatorId = req.creator.id;

  const orders = db.prepare(`
    SELECT pu.id, pu.amount_minor, pu.currency, pu.created_at,
           pu.fulfillment_status, pu.delivered_at,
           p.id AS product_id, p.title AS product_title, p.slug AS product_slug, p.type AS product_type,
           b.id AS buyer_id, b.name AS buyer_name, b.email AS buyer_email, u.phone AS buyer_phone
    FROM purchases pu
    JOIN products p ON p.id = pu.product_id
    JOIN buyers b ON b.id = pu.buyer_id
    LEFT JOIN users u ON u.id = b.user_id
    WHERE p.creator_id = ? AND pu.payment_status = 'paid'
    ORDER BY pu.created_at DESC
  `).all(creatorId);

  // "Running fast" is a 7-day window, deliberately separate from
  // top_products above (which is all-time revenue) — a product that's
  // suddenly selling this week is a different signal than one that's just
  // historically your best seller.
  const trending = db.prepare(`
    SELECT p.id, p.title, p.slug, COUNT(*) AS order_count
    FROM purchases pu
    JOIN products p ON p.id = pu.product_id
    WHERE p.creator_id = ? AND pu.payment_status = 'paid' AND pu.created_at >= datetime('now', '-7 days')
    GROUP BY p.id ORDER BY order_count DESC LIMIT 5
  `).all(creatorId);

  res.json({ orders, trending });
});

module.exports = router;
