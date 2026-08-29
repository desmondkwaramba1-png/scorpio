const db = require('../db/schema');
const { checkAndUpdateVerification } = require('./verification');
const { createDownloadToken, productHasFile } = require('./downloads');
const { productHasKeys, claimKeyForPurchase } = require('./licenseKeys');
const { startEscrow, startDeliveredHold } = require('./escrow');
const { sendEmail } = require('./notify');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Both the webhook and the status-poll route can call this for the same
// order — Dischub's own docs note the webhook can arrive more than once,
// and a buyer refreshing the return page triggers another poll. Guarding on
// "already paid" here is the actual double-credit protection, not just a
// nice-to-have: quantity_sold and download tokens must never be created twice.
function markPurchasePaid(purchaseId) {
  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
  if (!purchase || purchase.payment_status === 'paid') return purchase;

  db.prepare("UPDATE purchases SET payment_status = 'paid' WHERE id = ?").run(purchaseId);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(purchase.product_id);
  db.prepare('UPDATE products SET quantity_sold = quantity_sold + 1 WHERE id = ?').run(product.id);
  // Only a completed, paid order actually consumes a "first X buyers" promo
  // slot — a pending or failed checkout attempt never should.
  if (purchase.discount_applied) {
    db.prepare('UPDATE products SET discount_claimed = discount_claimed + 1 WHERE id = ?').run(product.id);
  }
  checkAndUpdateVerification(product.creator_id);

  // Services are a different transaction entirely: there's nothing to hand
  // over yet, because the work hasn't been done. Money goes to escrow
  // (awaiting_delivery) instead of an instant file/key handoff, and only
  // counts toward the seller's wallet once fulfillment actually completes
  // (see wallet.js and escrow.js).
  if (product.type === 'service') {
    startEscrow(purchaseId);
    const buyer = db.prepare('SELECT * FROM buyers WHERE id = ?').get(purchase.buyer_id);
    sendEmail(
      buyer.email,
      `Order placed: ${product.title}`,
      `Thanks for your order. Your payment is held safely until the seller marks it delivered — you'll get another email when that happens, with a chance to confirm or report a problem before it's released to them.`
    );
    return db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
  }

  // Digital goods hand the file/key over immediately, but the money still
  // goes through the same buyer-protection hold a service order gets —
  // just starting from "delivered" instead of "awaiting_delivery," since
  // there's nothing pending on the seller's side. See wallet.js/escrow.js.
  startDeliveredHold(purchaseId);

  const hasFile = productHasFile(product.id);
  // Claimed even if the product also has a file (e.g. a PDF manual plus a
  // license key) — the two deliverables aren't mutually exclusive. If this
  // comes back null despite productHasKeys() being true, checkout-time
  // stock checks failed to prevent an overselling race; the buyer's email
  // just won't mention a key, and the creator sees 0 left to add more to.
  const claimedKey = productHasKeys(product.id) ? claimKeyForPurchase(product.id, purchaseId) : null;

  if (hasFile || claimedKey) {
    const buyer = db.prepare('SELECT * FROM buyers WHERE id = ?').get(purchase.buyer_id);
    const lines = [];
    if (hasFile) {
      const token = createDownloadToken(purchaseId);
      lines.push(`Download: ${FRONTEND_URL}/api/downloads/${token}`);
    }
    if (claimedKey) lines.push(`Your license key: ${claimedKey.key_value}`);
    sendEmail(
      buyer.email, `Your order: ${product.title}`,
      `Thanks for your order.\n\n${lines.join('\n')}\n\nNot what you expected? Report it from your account within 5 days for a refund. After that it settles to the seller automatically.`
    );
  }

  return db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
}

function markPurchaseFailed(purchaseId) {
  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
  if (!purchase || purchase.payment_status === 'paid') return purchase; // never downgrade a paid order
  db.prepare("UPDATE purchases SET payment_status = 'failed' WHERE id = ?").run(purchaseId);
  return db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
}

module.exports = { markPurchasePaid, markPurchaseFailed };
