const { netOf } = require('../lib/fees');
const { format } = require('./money');
const { checkAndUpdateVerification } = require('./verification');
const { createDownloadToken, productHasFile } = require('./downloads');
const { productHasKeys, claimKeyForPurchase, unclaimedCount } = require('./licenseKeys');
const { startEscrow, startDeliveredHold, openDispute } = require('./escrow');
const { findOrCreateSubscription } = require('./subscriptions');
const { sendEmail } = require('./notify');
const db = require('../db/schema');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Both the webhook and the status-poll route can call this for the same
// order, Dischub's own docs note the webhook can arrive more than once,
// and a buyer refreshing the return page triggers another poll. Guarding on
// "already paid" here is the actual double-credit protection, not just a
// nice-to-have: quantity_sold and download tokens must never be created twice.
function markPurchasePaid(purchaseId) {
  const wasPending = db.prepare('SELECT payment_status FROM purchases WHERE id = ?').get(purchaseId)?.payment_status === 'pending';
  const completion = db.transaction(() => {
    let purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
    if (!purchase || purchase.payment_status !== 'pending') return { purchase, email: null };

    const { fee_minor, net_minor } = netOf(purchase.amount_minor);
    const paid = db.prepare(`
      UPDATE purchases
      SET payment_status = 'paid', fee_minor = ?, net_minor = ?
      WHERE id = ? AND payment_status = 'pending'
    `).run(fee_minor, net_minor, purchaseId);
    if (paid.changes === 0) {
      return { purchase: db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId), email: null };
    }
    purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(purchase.product_id);

    // A subscription renewal is not a new sale the way every other paid
    // purchase row against a product genuinely is, so it must not increase
    // quantity_sold or consume a first-buy promo slot.
    const isRenewal = product.type === 'subscription' &&
      !!db.prepare('SELECT 1 FROM subscriptions WHERE buyer_id = ? AND product_id = ?').get(purchase.buyer_id, product.id);

    // A reservation only lasts minutes but an EcoCash approval can land later,
    // after someone else took the last unit. The money is real, so this can't
    // be a quiet failure: the order goes to the refund queue and the buyer is told.
    const hasLimit = product.quantity_limit !== null && product.quantity_limit !== undefined;
    const soldOutAtPayment = !isRenewal && (
      (hasLimit && product.quantity_sold >= product.quantity_limit) ||
      (product.type !== 'subscription' && productHasKeys(product.id) && unclaimedCount(product.id) === 0)
    );

    if (!isRenewal) {
      db.prepare('UPDATE products SET quantity_sold = quantity_sold + 1 WHERE id = ?').run(product.id);
      if (purchase.discount_applied) {
        db.prepare('UPDATE products SET discount_claimed = discount_claimed + 1 WHERE id = ?').run(product.id);
      }
    }
    if (soldOutAtPayment) {
      openDispute(purchaseId, 'Automatic: this sold out before the payment was approved. Refund the buyer.');
      const buyer = db.prepare('SELECT * FROM buyers WHERE id = ?').get(purchase.buyer_id);
      return {
        purchase: db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId),
        email: {
          to: buyer.email,
          subject: `We owe you a refund: ${product.title}`,
          body: `Your payment came through, but the last one sold while it was being approved. You don't need to do anything: your payment is on hold and we'll refund it to your EcoCash number.`
        }
      };
    }

    checkAndUpdateVerification(product.creator_id);

    if (product.type === 'subscription') {
      startDeliveredHold(purchaseId);
      const { subscription, isNew } = findOrCreateSubscription({
        buyerId: purchase.buyer_id, creatorId: product.creator_id, productId: product.id,
        // A launch discount applies to the first month, not every renewal.
        priceMinor: purchase.discount_applied ? product.price_minor : purchase.amount_minor,
        currency: purchase.currency
      });
      db.prepare('UPDATE purchases SET subscription_id = ? WHERE id = ?').run(subscription.id, purchaseId);
      const buyer = db.prepare('SELECT * FROM buyers WHERE id = ?').get(purchase.buyer_id);
      const email = {
        to: buyer.email,
        subject: isNew ? `You're subscribed: ${product.title}` : `Subscription renewed: ${product.title}`,
        body: isNew
          ? `Thanks for subscribing! You'll get every new issue as it's published, for as long as you stay subscribed. EcoCash can't auto-charge, so we'll remind you a few days before each renewal and you approve it yourself: ${FRONTEND_URL}/account`
          : `Your subscription renewed. Access continues through ${subscription.current_period_end}: ${FRONTEND_URL}/account`
      };
      return { purchase: db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId), email };
    }

    if (product.type === 'service') {
      startEscrow(purchaseId);
      const buyer = db.prepare('SELECT * FROM buyers WHERE id = ?').get(purchase.buyer_id);
      return {
        purchase: db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId),
        email: {
          to: buyer.email,
          subject: `Order placed: ${product.title}`,
          body: `Thanks for your order. Your payment is held safely until the seller marks it delivered, you'll get another email when that happens, with a chance to confirm or report a problem before it's released to them.`
        }
      };
    }

    startDeliveredHold(purchaseId);
    const hasFile = productHasFile(product.id);
    const claimedKey = productHasKeys(product.id) ? claimKeyForPurchase(product.id, purchaseId) : null;

    let email = null;
    if (hasFile || claimedKey) {
      const buyer = db.prepare('SELECT * FROM buyers WHERE id = ?').get(purchase.buyer_id);
      const lines = [];
      if (hasFile) {
        const token = createDownloadToken(purchaseId);
        lines.push(`Here's your download link:\n${FRONTEND_URL}/api/downloads/${token}`);
      }
      if (claimedKey) lines.push(`Your license key: ${claimedKey.key_value}`);
      email = {
        to: buyer.email,
        subject: `Your order: ${product.title}`,
        body: `Thanks for your order.\n\n${lines.join('\n')}\n\nNot what you expected? Report it from your account within 5 days for a refund. After that it settles to the seller automatically.`
      };
    }

    return { purchase: db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId), email };
  })();

  if (completion.email) {
    sendEmail(completion.email.to, completion.email.subject, completion.email.body)
      .catch(err => console.error('[purchase email]', err.message));
  }
  if (wasPending && completion.purchase?.payment_status === 'paid' && completion.purchase.amount_minor > 0) {
    notifySellerOfSale(completion.purchase);
  }
  return completion.purchase;
}

// Sellers have to hear about a sale, above all a service they now need to deliver.
function notifySellerOfSale(purchase) {
  const sale = db.prepare(`
    SELECT p.title, p.type, u.email FROM products p
    JOIN creators c ON c.id = p.creator_id
    JOIN users u ON u.id = c.user_id
    WHERE p.id = ?
  `).get(purchase.product_id);
  if (!sale?.email) return;
  const next = sale.type === 'service'
    ? `Deliver it from your orders: ${FRONTEND_URL}/dashboard/orders`
    : `See it in your orders: ${FRONTEND_URL}/dashboard/orders`;
  sendEmail(sale.email, `You made a sale: ${sale.title}`, `Someone just bought ${sale.title} for ${format(purchase.amount_minor, purchase.currency)}.\n\n${next}`)
    .catch(err => console.error('[sale email]', err.message));
}

function markPurchaseFailed(purchaseId) {
  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
  if (!purchase || purchase.payment_status === 'paid') return purchase; // never downgrade a paid order
  db.prepare("UPDATE purchases SET payment_status = 'failed' WHERE id = ?").run(purchaseId);
  return db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
}

module.exports = { markPurchasePaid, markPurchaseFailed };
