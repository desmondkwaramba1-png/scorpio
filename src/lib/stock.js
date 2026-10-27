const db = require('../db/schema');
const { productHasKeys, unclaimedCount } = require('./licenseKeys');

// An unpaid checkout holds its unit for this long. quantity_sold and key
// claims only change once a payment is confirmed, so without a hold N buyers
// could all start checkout on the last unit, all pay, and all be fulfilled
// (oversold) — or, for license keys, pay and receive no key at all.
const RESERVATION_MINUTES = 10;

function pendingReservations(productId, excludeBuyerId) {
  return db.prepare(`
    SELECT COUNT(*) AS n FROM purchases
    WHERE product_id = ? AND payment_status = 'pending'
      AND created_at >= datetime('now', ?)
      AND (? IS NULL OR buyer_id != ?)
  `).get(productId, `-${RESERVATION_MINUTES} minutes`, excludeBuyerId ?? null, excludeBuyerId ?? null).n;
}

// Sold out if an explicit quantity_limit says so, or (for software delivered
// by key) there are no unclaimed keys left, counting units other buyers are
// currently in the middle of paying for.
function isSoldOut(product, { excludeBuyerId = null } = {}) {
  const hasLimit = product.quantity_limit !== null && product.quantity_limit !== undefined;
  const hasKeys = productHasKeys(product.id);
  if (!hasLimit && !hasKeys) return false;

  const held = pendingReservations(product.id, excludeBuyerId);
  if (hasLimit && product.quantity_sold + held >= product.quantity_limit) return true;
  if (hasKeys && unclaimedCount(product.id) - held <= 0) return true;
  return false;
}

module.exports = { isSoldOut, RESERVATION_MINUTES };
