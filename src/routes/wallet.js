const express = require('express');
const db = require('../db/schema');
const { requireAuth, requireCreator } = require('../middleware/auth');
const { sweepAutoReleases } = require('../lib/escrow');
const { PLATFORM_FEE_PERCENT, netOf } = require('../lib/fees');

const router = express.Router();

router.get('/me', requireAuth, requireCreator, (req, res) => {
  sweepAutoReleases();

  const rows = db.prepare(`
    SELECT pu.id, pu.amount_minor, pu.currency, pu.payment_status, pu.fulfillment_status, pu.created_at,
           p.title AS product_title, b.name AS buyer_name, b.email AS buyer_email
    FROM purchases pu
    JOIN products p ON p.id = pu.product_id
    JOIN buyers b ON b.id = pu.buyer_id
    WHERE p.creator_id = ?
    ORDER BY pu.created_at DESC
  `).all(req.creator.id);

  const transactions = rows.map(r => ({
    ...r,
    ...netOf(r.payment_status === 'paid' ? r.amount_minor : 0)
  }));

  const paid = rows.filter(r => r.payment_status === 'paid');
  // A service order (fulfillment_status set) only counts as available once
  // it's actually released — before that it's real money, but it's the
  // buyer's until delivery is confirmed, not the seller's to withdraw yet.
  const available = paid.filter(r => !r.fulfillment_status || r.fulfillment_status === 'released');
  const escrowed = paid.filter(r => r.fulfillment_status && !['released', 'refunded'].includes(r.fulfillment_status));

  const grossMinor = paid.reduce((sum, r) => sum + r.amount_minor, 0);
  const { fee_minor: feeMinor, net_minor: netMinor } = netOf(available.reduce((sum, r) => sum + r.amount_minor, 0));
  const escrowedMinor = escrowed.reduce((sum, r) => sum + r.amount_minor, 0);

  res.json({
    currency: 'USD',
    gross_minor: grossMinor,
    fee_minor: feeMinor,
    available_minor: netMinor,
    escrowed_minor: escrowedMinor,
    fee_policy: `${PLATFORM_FEE_PERCENT}% per paid order`,
    payout_number: req.creator.payout_ecocash_number || null,
    transactions
  });
});

module.exports = router;
