const express = require('express');
const { randomBytes } = require('crypto');
const db = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { isPromoActive, applyDiscount } = require('../lib/promotions');
const { createOrder, isValidSenderPhone } = require('../services/payment');
const { checkoutLimiter } = require('../middleware/rateLimit');
const { markPurchaseFailed } = require('../lib/purchaseCompletion');
const { productHasKeys, unclaimedCount } = require('../lib/licenseKeys');

const router = express.Router();

// Sold out if either stock signal says so, an explicit quantity_limit, or
// (for software delivered by key) simply running out of unclaimed keys,
// even when no quantity_limit was ever set.
function isSoldOut(product) {
  if (product.quantity_limit !== null && product.quantity_sold >= product.quantity_limit) return true;
  if (productHasKeys(product.id) && unclaimedCount(product.id) <= 0) return true;
  return false;
}

const CART_SELECT = `
  SELECT ci.id AS cart_item_id, ci.created_at AS added_at, p.*,
         c.name AS creator_name, c.handle AS creator_handle, c.avatar_path AS creator_avatar
  FROM cart_items ci
  JOIN products p ON p.id = ci.product_id
  JOIN creators c ON c.id = p.creator_id
  WHERE ci.user_id = ?
  ORDER BY ci.created_at DESC
`;

function withPromo(product) {
  const active = !product.pay_what_you_want && isPromoActive(product);
  product.promo_active = active;
  product.discounted_price_minor = active ? applyDiscount(product.price_minor, product.discount_percent) : null;
  return product;
}

function cartCount(userId) {
  return db.prepare('SELECT COUNT(*) AS n FROM cart_items WHERE user_id = ?').get(userId).n;
}

// GET /api/cart
router.get('/', requireAuth, (req, res) => {
  res.json(db.prepare(CART_SELECT).all(req.user.id).map(withPromo));
});

// GET /api/cart/count, lightweight, just for the nav badge.
router.get('/count', requireAuth, (req, res) => {
  res.json({ cart_count: cartCount(req.user.id) });
});

// POST /api/cart, { product_slug }
router.post('/', requireAuth, (req, res) => {
  const { product_slug } = req.body;
  const product = db.prepare("SELECT * FROM products WHERE slug = ? AND status = 'published'").get(product_slug);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  // Same rule as the direct-buy flow (purchases.js): you can't buy your
  // own product. Blocked here too so it can't be reached by adding to the
  // cart from a stale tab or hitting the API directly.
  if (req.creator && req.creator.id === product.creator_id) {
    return res.status(403).json({ error: "That's your own product, you can't buy it." });
  }

  // Pay-what-you-want needs a buyer-chosen amount per item, which a shared
  // cart total can't represent, that flow stays on the product's own
  // direct checkout instead of going through the cart.
  if (product.pay_what_you_want) {
    return res.status(400).json({ error: 'This product lets you name your price. Buy it directly from its page instead of the cart.' });
  }
  // Free products settle instantly with no EcoCash step at all (see
  // purchases.js), mixing that into a shared, possibly multi-item cart
  // total that DOES need a real charge just complicates the checkout for
  // no benefit. Get it straight from the product page instead.
  if (product.price_minor === 0) {
    return res.status(400).json({ error: 'This product is free, get it directly from its page instead of the cart.' });
  }
  // Services need their own checkout so the escrow/payment-protection
  // messaging actually shows, the shared cart checkout doesn't know how
  // to explain that to a buyer mid-cart.
  if (product.type === 'service') {
    return res.status(400).json({ error: 'Services are ordered directly from their page, not through the cart.' });
  }
  if (isSoldOut(product)) {
    return res.status(409).json({ error: 'This product is sold out.' });
  }

  try {
    db.prepare('INSERT INTO cart_items (user_id, product_id) VALUES (?, ?)').run(req.user.id, product.id);
  } catch (err) {
    if (!/UNIQUE/.test(err.message)) throw err; // already in cart, treat as success
  }
  res.status(201).json({ added: true, cart_count: cartCount(req.user.id) });
});

// DELETE /api/cart/:productId
router.delete('/:productId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.user.id, req.params.productId);
  res.json({ removed: true, cart_count: cartCount(req.user.id) });
});

// POST /api/cart/checkout, { email, name, phone }. One Dischub order for
// the combined total; one `purchases` row per cart item, all sharing that
// order's payment_reference. This works with zero payment-splitting logic
// because every order, regardless of which creator's product it is ,
// already settles to the platform's single Dischub recipient account
// (see services/payment.js RECIPIENT); a cart spanning multiple sellers
// costs nothing extra here, it's the same one-recipient charge either way.
router.post('/checkout', checkoutLimiter, requireAuth, async (req, res) => {
  const { email, name, phone } = req.body;
  if (!email || !phone) return res.status(400).json({ error: 'email and phone are required.' });
  if (!isValidSenderPhone(phone)) {
    return res.status(400).json({ error: 'Enter a valid EcoCash number, e.g. 0780070488 or +263780070488.' });
  }

  const items = db.prepare(CART_SELECT).all(req.user.id).map(withPromo);
  if (items.length === 0) return res.status(400).json({ error: 'Your cart is empty.' });

  // A creator can't buy through their own storefront, catch it here in
  // case one slipped into the cart before this rule existed, or from a
  // second tab open as a different context.
  if (req.creator && items.some(p => p.creator_id === req.creator.id)) {
    const own = items.filter(p => p.creator_id === req.creator.id).map(p => p.title).join(', ');
    return res.status(403).json({ error: `${own} ${own.includes(',') ? 'are' : 'is'} your own, remove ${own.includes(',') ? 'them' : 'it'} from your cart to check out.` });
  }

  // Re-checked against reality at the moment of paying, not what the
  // buyer's browser cached when they added it, a product can go sold out
  // or get unpublished between adding to cart and checking out.
  const unavailable = items.filter(p => p.status !== 'published' || isSoldOut(p));
  if (unavailable.length > 0) {
    return res.status(409).json({
      error: `${unavailable.map(p => p.title).join(', ')} ${unavailable.length === 1 ? 'is' : 'are'} no longer available. Remove ${unavailable.length === 1 ? 'it' : 'them'} from your cart and try again.`
    });
  }

  const currencies = new Set(items.map(p => p.currency));
  if (currencies.size > 1) {
    return res.status(400).json({ error: 'Your cart has items priced in different currencies. Check out one currency at a time for now.' });
  }
  const currency = items[0].currency;

  const lineAmounts = items.map(p => p.promo_active ? p.discounted_price_minor : p.price_minor);
  const totalMinor = lineAmounts.reduce((sum, n) => sum + n, 0);
  if (totalMinor <= 0 || totalMinor >= 10000000) {
    return res.status(400).json({ error: 'Cart total must be greater than 0 and less than 100,000.' });
  }

  let buyer = db.prepare('SELECT * FROM buyers WHERE email = ?').get(email);
  if (!buyer) {
    const result = db.prepare('INSERT INTO buyers (name, email, user_id) VALUES (?, ?, ?)').run(name || null, email, req.user.id);
    buyer = db.prepare('SELECT * FROM buyers WHERE id = ?').get(result.lastInsertRowid);
  } else if (!buyer.user_id) {
    db.prepare('UPDATE buyers SET user_id = ? WHERE id = ?').run(req.user.id, buyer.id);
  }

  // Not tied to any single purchase id the way the direct-buy flow's
  // order_id is (zs${purchaseId}...), a cart order covers several
  // purchase rows at once, so there's no one id to derive it from.
  const orderId = `zsc${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;

  const insert = db.prepare(`
    INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_status, payment_reference, discount_applied)
    VALUES (?, ?, ?, ?, 'pending', ?, ?)
  `);
  const purchaseIds = items.map((p, i) =>
    insert.run(buyer.id, p.id, lineAmounts[i], currency, orderId, p.promo_active ? 1 : 0).lastInsertRowid
  );

  // Non-redirecting flow: triggers a real EcoCash prompt on the buyer's
  // phone directly. No pay_url, the frontend moves to /payment/return
  // client-side and polls status from there.
  const order = await createOrder({ orderId, sender: phone, amountMinor: totalMinor, currency });

  if (!order.success) {
    for (const id of purchaseIds) markPurchaseFailed(id);
    return res.status(502).json({ error: order.error });
  }

  db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);

  res.status(201).json({ order_id: orderId, ecocash_status: order.ecocashStatus });
});

module.exports = router;
