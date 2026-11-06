const db = require('../db/schema');
const { netOf } = require('./fees');

function remainingNetByPurchaseFor(creatorId, paidRows) {
  const remaining = new Map(paidRows.map(row => [row.id, netOf(row.amount_minor).net_minor]));
  const recorded = db.prepare(`
    SELECT pa.purchase_id, SUM(pa.amount_minor) AS amount_minor
    FROM payout_allocations pa JOIN payouts po ON po.id = pa.payout_id
    WHERE po.creator_id = ? GROUP BY pa.purchase_id
  `).all(creatorId);
  for (const allocation of recorded) {
    if (remaining.has(allocation.purchase_id)) {
      remaining.set(allocation.purchase_id, Math.max(0, remaining.get(allocation.purchase_id) - allocation.amount_minor));
    }
  }

  // Older payout rows lack purchase allocation records. Reconstruct them
  // oldest-first within currency and never across the payout's paid date.
  const legacyPayouts = db.prepare(`
    SELECT po.amount_minor, po.currency, po.paid_at
    FROM payouts po
    WHERE po.creator_id = ? AND NOT EXISTS (
      SELECT 1 FROM payout_allocations pa WHERE pa.payout_id = po.id
    )
    ORDER BY po.paid_at, po.id
  `).all(creatorId);
  for (const payout of legacyPayouts) {
    let payoutRemaining = payout.amount_minor;
    const candidates = paidRows.filter(row => row.currency === payout.currency && row.created_at <= payout.paid_at)
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
    for (const purchase of candidates) {
      const purchaseRemaining = remaining.get(purchase.id) || 0;
      const allocation = Math.min(purchaseRemaining, payoutRemaining);
      remaining.set(purchase.id, purchaseRemaining - allocation);
      payoutRemaining -= allocation;
      if (!payoutRemaining) break;
    }
  }
  return remaining;
}

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
    SELECT pu.id, pu.amount_minor, pu.payment_status, pu.fulfillment_status,
           pu.created_at, p.id AS product_id, p.title AS product_title, pu.currency
    FROM purchases pu JOIN products p ON p.id = pu.product_id
    WHERE p.creator_id = ?
  `).all(creatorId);

  const paid = rows.filter(r => r.payment_status === 'paid');
  const remaining = remainingNetByPurchaseFor(creatorId, paid);
  const paidOutRows = db.prepare(`
    SELECT currency, COALESCE(SUM(amount_minor),0) AS amount_minor
    FROM payouts WHERE creator_id = ? GROUP BY currency
  `).all(creatorId);
  const paidOutByCurrency = new Map(paidOutRows.map(row => [row.currency, row.amount_minor]));
  const riskyProducts = db.prepare(`
    SELECT p.id, p.title, p.currency
    FROM products p
    WHERE p.creator_id = ? AND (
      EXISTS (
        SELECT 1 FROM reports r
        WHERE r.product_id = p.id AND r.status = 'open' AND r.serious_claim = 1
      ) OR EXISTS (
        SELECT 1 FROM purchases pu
        JOIN service_disputes d ON d.purchase_id = pu.id
        WHERE pu.product_id = p.id AND d.status = 'open' AND d.serious_claim = 1
      )
    )
    ORDER BY p.id
  `).all(creatorId);

  const heldProductIds = new Set(riskyProducts.map(p => p.id));
  const currencies = new Set([
    ...paid.map(row => row.currency),
    ...paidOutByCurrency.keys()
  ]);
  const balancesByCurrency = {};

  for (const currency of currencies) {
    const currencyPaid = paid.filter(row => row.currency === currency);
    const available = currencyPaid.filter(row => !row.fulfillment_status || row.fulfillment_status === 'released');
    const escrowed = currencyPaid.filter(row => row.fulfillment_status && !['released', 'refunded'].includes(row.fulfillment_status));
    const feeMinor = currencyPaid.reduce((sum, row) => sum + netOf(row.amount_minor).fee_minor, 0);
    const grossMinor = currencyPaid.reduce((sum, row) => sum + row.amount_minor, 0);
    const availableNetMinor = available.reduce((sum, row) => sum + (remaining.get(row.id) || 0), 0);
    const escrowedMinor = escrowed.reduce((sum, row) => sum + netOf(row.amount_minor).net_minor, 0);
    const paidOutMinor = paidOutByCurrency.get(currency) || 0;
    const productHoldAmounts = new Map(riskyProducts.map(product => [product.id, 0]));

    for (const purchase of [...available].sort((a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id - b.id
    )) {
      if (heldProductIds.has(purchase.product_id)) {
        productHoldAmounts.set(purchase.product_id, productHoldAmounts.get(purchase.product_id) + (remaining.get(purchase.id) || 0));
      }
    }

    const unpaidBeforeRiskHold = availableNetMinor;
    let riskHoldRemaining = unpaidBeforeRiskHold;
    const productHolds = riskyProducts.map(product => {
      const amountMinor = Math.min(productHoldAmounts.get(product.id), riskHoldRemaining);
      riskHoldRemaining -= amountMinor;
      return { product_id: product.id, product_title: product.title, currency, amount_minor: amountMinor };
    }).filter(hold => hold.amount_minor > 0);
    const productHoldMinor = productHolds.reduce((sum, hold) => sum + hold.amount_minor, 0);

    balancesByCurrency[currency] = {
      currency, gross_minor: grossMinor, fee_minor: feeMinor,
      available_minor: Math.max(0, unpaidBeforeRiskHold - productHoldMinor),
      escrowed_minor: escrowedMinor, product_hold_minor: productHoldMinor,
      product_holds: productHolds, paid_out_minor: paidOutMinor
    };
  }

  const usd = balancesByCurrency.USD || {
    currency: 'USD', gross_minor: 0, fee_minor: 0, available_minor: 0,
    escrowed_minor: 0, product_hold_minor: 0, product_holds: [], paid_out_minor: 0
  };
  return { ...usd, balances_by_currency: balancesByCurrency };
}

module.exports = { balancesFor, remainingNetByPurchaseFor };
