const db = require('../db/schema');

// Does this buyer already have what this product sells? Services are excluded
// because hiring someone twice is normal. A subscription counts only while it
// is live, so someone whose access ended can subscribe again.
function buyerOwnsProduct(buyerId, product) {
  if (!buyerId || product.type === 'service') return false;
  if (product.type === 'subscription') {
    return !!db.prepare(`
      SELECT 1 FROM subscriptions
      WHERE buyer_id = ? AND product_id = ? AND status = 'active' AND current_period_end > datetime('now')
    `).get(buyerId, product.id);
  }
  return !!db.prepare(`
    SELECT 1 FROM purchases
    WHERE buyer_id = ? AND product_id = ? AND payment_status = 'paid'
      AND COALESCE(fulfillment_status, '') != 'refunded'
  `).get(buyerId, product.id);
}

module.exports = { buyerOwnsProduct };
