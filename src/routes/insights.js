const express = require('express');
const db = require('../db/schema');
const { requireAuth, requireCreator } = require('../middleware/auth');
const { sweepAutoReleases } = require('../lib/escrow');
const { balancesFor } = require('../lib/walletBalances');

const router = express.Router();

// GET /api/insights/me — built entirely from real purchase rows. No view
// tracking exists yet, so this reports orders and revenue, not traffic —
// nothing here is a placeholder number.
router.get('/me', requireAuth, requireCreator, (req, res) => {
  sweepAutoReleases();
  const creatorId = req.creator.id;

  // A refund is not revenue, and USD and ZiG are never added together.
  const KEPT = `pu.payment_status = 'paid' AND COALESCE(pu.fulfillment_status, '') != 'refunded'`;
  const orderCount = db.prepare(`
    SELECT COUNT(*) AS n FROM purchases pu JOIN products p ON p.id = pu.product_id
    WHERE p.creator_id = ? AND ${KEPT}
  `).get(creatorId).n;
  const revenueByCurrency = Object.fromEntries(db.prepare(`
    SELECT pu.currency, SUM(pu.amount_minor) AS n FROM purchases pu JOIN products p ON p.id = pu.product_id
    WHERE p.creator_id = ? AND ${KEPT} AND pu.amount_minor > 0
    GROUP BY pu.currency
  `).all(creatorId).map(row => [row.currency, row.n]));
  const chartCurrency = revenueByCurrency.USD !== undefined ? 'USD' : Object.keys(revenueByCurrency)[0] || 'USD';

  // Same "held vs actually yours" split wallet.js shows, from the same
  // function — this used to reimplement the math inline, gross minus
  // escrow minus fee, with no idea payouts.js's payouts table existed.
  // Silently correct only because nobody had been paid out yet: the
  // instant a real payout happened, this would have kept showing the
  // full pre-payout balance as "available" forever, exactly the
  // "quietly drift apart" walletBalances.js's own comment exists to
  // prevent, just not being used here to prevent it.
  const balances = balancesFor(creatorId);
  const escrowed = balances.escrowed_minor;
  const availableMinor = balances.available_minor;

  const awaitingActionCount = db.prepare(`
    SELECT COUNT(*) AS n FROM purchases pu
    JOIN products p ON p.id = pu.product_id
    WHERE p.creator_id = ? AND pu.payment_status = 'paid' AND pu.fulfillment_status = 'awaiting_delivery'
  `).get(creatorId).n;

  // Every one of the last 30 days, including quiet ones, so the chart shows real
  // time passing instead of stretching a single sale across the whole width.
  const dayRows = new Map(db.prepare(`
    SELECT date(pu.created_at) AS day, SUM(pu.amount_minor) AS revenue_minor, COUNT(*) AS orders
    FROM purchases pu
    JOIN products p ON p.id = pu.product_id
    WHERE p.creator_id = ? AND ${KEPT} AND pu.currency = ? AND pu.created_at >= datetime('now', '-30 days')
    GROUP BY day
  `).all(creatorId, chartCurrency).map(row => [row.day, row]));
  const revenueByDay = Array.from({ length: 30 }, (_, index) => {
    const day = new Date(Date.now() - (29 - index) * 864e5).toISOString().slice(0, 10);
    return dayRows.get(day) || { day, revenue_minor: 0, orders: 0 };
  });

  const topProducts = db.prepare(`
    SELECT p.id, p.title, p.slug, pu.currency, COUNT(*) AS order_count, COALESCE(SUM(pu.amount_minor), 0) AS revenue_minor
    FROM purchases pu
    JOIN products p ON p.id = pu.product_id
    WHERE p.creator_id = ? AND ${KEPT}
    GROUP BY p.id, pu.currency ORDER BY order_count DESC, revenue_minor DESC LIMIT 5
  `).all(creatorId);

  const productCounts = db.prepare(`
    SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published
    FROM products WHERE creator_id = ?
  `).get(creatorId);

  res.json({
    currency: chartCurrency,
    order_count: orderCount,
    revenue_by_currency: revenueByCurrency,
    available_minor: availableMinor,
    escrowed_minor: escrowed,
    awaiting_action_count: awaitingActionCount,
    revenue_by_day: revenueByDay,
    top_products: topProducts,
    product_count: productCounts.total,
    published_count: productCounts.published || 0
  });
});

// GET /api/insights/orders — the creator's order list and dispute context.
router.get('/orders', requireAuth, requireCreator, (req, res) => {
  sweepAutoReleases();
  const creatorId = req.creator.id;

  const orders = db.prepare(`
    SELECT pu.id, pu.amount_minor, pu.currency, pu.created_at,
           pu.fulfillment_status, pu.delivered_at,
           p.id AS product_id, p.title AS product_title, p.slug AS product_slug, p.type AS product_type,
           b.id AS buyer_id, b.name AS buyer_name,
              d.id AS dispute_id, d.reason AS dispute_reason, d.status AS dispute_status,
           EXISTS(SELECT 1 FROM reports r WHERE r.purchase_id = pu.id AND r.status = 'open') AS has_open_report
    FROM purchases pu
    JOIN products p ON p.id = pu.product_id
    JOIN buyers b ON b.id = pu.buyer_id
    LEFT JOIN service_disputes d ON d.purchase_id = pu.id AND d.status = 'open'
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
