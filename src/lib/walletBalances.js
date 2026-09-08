const db = require('../db/schema');
const { netOf } = require('./fees');

// Single source of truth for "what does this creator's wallet look like" —
// used by both the creator's own Wallet page (routes/wallet.js) and the
// admin payouts view (routes/admin.js), so the two can never quietly
// disagree about what a creator is owed. Same escrow rule either way: a
// purchase only counts as available once its fulfillment_status is null
// (nothing to hold, shouldn't happen post-purchase but treated safely) or
// 'released' — everything else (awaiting_delivery, delivered-but-still-in-
// its-5-day-window, disputed) is real money that isn't the seller's to
// draw on yet.
function balancesFor(creatorId) {
  const rows = db.prepare(`
    SELECT pu.amount_minor, pu.payment_status, pu.fulfillment_status
    FROM purchases pu JOIN products p ON p.id = pu.product_id
    WHERE p.creator_id = ?
  `).all(creatorId);

  const paid = rows.filter(r => r.payment_status === 'paid');
  const available = paid.filter(r => !r.fulfillment_status || r.fulfillment_status === 'released');
  const escrowed = paid.filter(r => r.fulfillment_status && !['released', 'refunded'].includes(r.fulfillment_status));

  const grossMinor = paid.reduce((sum, r) => sum + r.amount_minor, 0);
  const { fee_minor: feeMinor, net_minor: unpaidMinor } = netOf(available.reduce((sum, r) => sum + r.amount_minor, 0));
  const escrowedMinor = escrowed.reduce((sum, r) => sum + r.amount_minor, 0);

  const paidOutMinor = db.prepare('SELECT COALESCE(SUM(amount_minor),0) AS n FROM payouts WHERE creator_id = ?').get(creatorId).n;
  const availableMinor = Math.max(0, unpaidMinor - paidOutMinor);

  return {
    gross_minor: grossMinor, fee_minor: feeMinor, available_minor: availableMinor,
    escrowed_minor: escrowedMinor, paid_out_minor: paidOutMinor
  };
}

module.exports = { balancesFor };
