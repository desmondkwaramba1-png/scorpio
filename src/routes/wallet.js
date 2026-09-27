const express = require('express');
const db = require('../db/schema');
const { requireAuth, requireCreator } = require('../middleware/auth');
const { sweepAutoReleases } = require('../lib/escrow');
const { PLATFORM_FEE_PERCENT, netOf } = require('../lib/fees');
const { balancesFor } = require('../lib/walletBalances');

const router = express.Router();

router.get('/me', requireAuth, requireCreator, (req, res) => {
  sweepAutoReleases();

  const rows = db.prepare(`
    SELECT pu.id, pu.amount_minor, pu.currency, pu.payment_status, pu.fulfillment_status, pu.created_at, pu.fee_minor, pu.net_minor, p.title AS product_title, b.name AS buyer_name, b.email AS buyer_email
    FROM purchases pu
    JOIN products p ON p.id = pu.product_id
    JOIN buyers b ON b.id = pu.buyer_id
    WHERE p.creator_id = ?
    ORDER BY pu.created_at DESC
  `).all(req.creator.id);

  const transactions = rows.map(r => ({
    ...r,
    fee_minor: r.payment_status === 'paid' ? r.fee_minor : 0,
    net_minor: r.payment_status === 'paid' ? r.net_minor : 0
  }));

  res.json({
    currency: 'USD',
    ...balancesFor(req.creator.id),
    fee_policy: `${PLATFORM_FEE_PERCENT}% per paid order`,
    payout_number: req.creator.payout_ecocash_number || null,
    transactions
  });
});

module.exports = router;
