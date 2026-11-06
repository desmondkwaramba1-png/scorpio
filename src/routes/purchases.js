const express = require('express');
const multer = require('multer');
const path = require('path');
const { randomUUID, randomBytes } = require('crypto');
const db = require('../db/schema');
const { createOrder, checkOrderStatus, isValidSenderPhone } = require('../services/payment');
const { toMinor } = require('../lib/money');
const { isPromoActive, applyDiscount } = require('../lib/promotions');
const { checkoutLimiter, orderLookupLimiter } = require('../middleware/rateLimit');
const { requireVerified, requireAuth, requireCreator } = require('../middleware/auth');
const { createDownloadToken, getActiveTokenForPurchase, productHasFile, getProductFile, isVideoFilename, isAudioFilename } = require('../lib/downloads');
const { keyForPurchase } = require('../lib/licenseKeys');
const { isSoldOut, promoSlotOpen } = require('../lib/stock');
const { buyerOwnsProduct } = require('../lib/ownership');
const { buyerForUser } = require('../lib/buyers');
const { reconcileForUser } = require('../lib/reconcilePayments');
const { normalizeExternalUrl } = require('../lib/safeUrl');
const { sweepAutoReleases, deliveryFor, disputeFor, markDelivered, confirmDelivery, openDispute } = require('../lib/escrow');
const { sendEmail } = require('../lib/notify');
const { markPurchasePaid, markPurchaseFailed } = require('../lib/purchaseCompletion');
const storage = require('../lib/storage');
const { hasOffPlatformContact } = require('../lib/disputeMessagePolicy');

// A double tap or a second tab must not send a second EcoCash prompt. Short on
// purpose: someone who missed the first prompt can still try again.
const DUPLICATE_CHECKOUT_SECONDS = 45;

const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// A service delivery can legitimately be almost any file type (that's the
// whole point — it's the seller's actual work product), so this can't take
// the strict allowlist the product-listing uploads use. It can still block
// the specific types that turn "served back out" into a real vulnerability:
// browser-executable content (.html, .svg — see products.js's comment for
// why). Uploaded as a public R2 object, same as before this migration —
// the URL is only ever handed to the buyer who paid (file_url below), not
// gated behind the token system product files use; that was already true
// of the old /uploads link, not a change introduced by this migration.
const BLOCKED_DELIVERY_TYPES = new Set(['text/html', 'image/svg+xml', 'application/xhtml+xml']);
const deliveryUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter(req, file, cb) {
    if (BLOCKED_DELIVERY_TYPES.has(file.mimetype)) {
      return cb(new Error("That file type isn't allowed here."));
    }
    cb(null, true);
  },
  limits: { fileSize: 25 * 1024 * 1024 }
});

function fileAccessFor(purchase) {
  if (purchase.payment_status !== 'paid' || purchase.fulfillment_status === 'refunded') {
    return { download_url: null, view_url: null, is_video: false, is_audio: false, is_external: false, license_key: null };
  }
  const file = getProductFile(purchase.product_id);
  const keyRow = keyForPurchase(purchase.id);

  let downloadUrl = null, viewUrl = null, isVideo = false, isAudio = false;
  if (file) {
    if (file.kind === 'external_link') {
      viewUrl = normalizeExternalUrl(file.external_url);
    } else {
      const token = getActiveTokenForPurchase(purchase.id) || { token: createDownloadToken(purchase.id) };
      downloadUrl = `/api/downloads/${token.token}`;
      viewUrl = `/api/downloads/${token.token}/view`;
      isVideo = isVideoFilename(file.original_filename);
      isAudio = isAudioFilename(file.original_filename);
    }
  }

  return {
    download_url: downloadUrl,
    view_url: viewUrl,
    is_video: isVideo,
    is_audio: isAudio,
    is_external: file?.kind === 'external_link',
    license_key: keyRow ? keyRow.key_value : null
  };
}

// null for every ordinary digital-goods purchase — fulfillment_status only
// gets set at all for a service order (see purchaseCompletion.js).
// expected_by lets the buyer (and the UI) tell "still within the window
// the seller promised" apart from "this is already late" — the seller's
// own delivery_days estimate, counted from when the order was paid for,
// not enforced anywhere server-side (a buyer can already dispute an
// awaiting_delivery order any time — see POST /:id/dispute), just surfaced
// so a buyer knows when they're reasonably justified in doing so.
function serviceStatusFor(purchase) {
  if (!purchase.fulfillment_status) return null;
  // Any order can end up in a case, so a digital order in dispute or refunded
  // needs the same case details, or the buyer loses the chat on refresh.
  const inCase = ['disputed', 'refunded'].includes(purchase.fulfillment_status);
  if (purchase.product_type !== 'service' && !inCase) return null;
  const delivery = deliveryFor(purchase.id);
  const dispute = disputeFor(purchase.id);
  let expectedBy = null;
  if (purchase.delivery_days) {
    const due = new Date(purchase.created_at.replace(' ', 'T') + 'Z');
    due.setUTCDate(due.getUTCDate() + purchase.delivery_days);
    expectedBy = due.toISOString();
  }
  return {
    fulfillment_status: purchase.fulfillment_status,
    delivered_at: purchase.delivered_at,
    expected_by: expectedBy,
    delivery: delivery ? {
      message: delivery.message,
      external_url: delivery.external_url,
      file_url: delivery.storage_path || null
    } : null,
    dispute: dispute ? {
      id: dispute.id,
      reason: dispute.reason,
      status: dispute.status,
      resolution_note: dispute.resolution_note,
      hold_paused: dispute.status === 'open'
    } : null
  };
}

// GET /api/purchases/mine — a logged-in buyer's own order history.
router.get('/mine', requireAuth, async (req, res) => {
  sweepAutoReleases();
  // A buyer who approved EcoCash after closing the checkout page is paid up
  // but still 'pending' here. Ask the gateway now so their order is complete
  // the moment they look; a gateway hiccup must never break the page.
  await reconcileForUser(req.user.id).catch(err => console.error('[mine reconcile]', err.message));

  const purchases = db.prepare(`
    SELECT pu.*, p.title AS product_title, p.slug AS product_slug, p.cover_path AS product_cover_path,
           p.delivery_days AS delivery_days, p.type AS product_type,
           c.name AS creator_name, c.handle AS creator_handle,
           EXISTS(SELECT 1 FROM reports r WHERE r.purchase_id = pu.id AND r.status = 'open') AS has_open_report
    FROM purchases pu
    JOIN buyers b ON b.id = pu.buyer_id
    JOIN products p ON p.id = pu.product_id
    JOIN creators c ON c.id = p.creator_id
    WHERE b.user_id = ?
    ORDER BY pu.created_at DESC
  `).all(req.user.id);

  const latestIssueStmt = db.prepare(
    'SELECT issue_number, title, published_at FROM issues WHERE product_id = ? ORDER BY issue_number DESC LIMIT 1'
  );
  for (const p of purchases) {
    Object.assign(p, fileAccessFor(p));
    p.service = serviceStatusFor(p);
    // A serial is "buy once, issues keep arriving" — the buyer's own
    // library is exactly where "has anything new actually shown up"
    // needs answering, not just the product page they bought it from
    // once and may never revisit.
    if (p.product_type === 'serial' && p.payment_status === 'paid') {
      p.latest_issue = latestIssueStmt.get(p.product_id) || null;
    }
  }
  res.json(purchases);
});

// POST /api/purchases/:id/deliver — seller marks a service order delivered.
// Owner-only, and only from awaiting_delivery — a delivery is a one-time
// event for v1, not something that can be edited or re-sent.
router.post('/:id/deliver', requireAuth, requireCreator, deliveryUpload.single('file'), async (req, res) => {
  const purchase = db.prepare(`
    SELECT pu.*, p.creator_id, p.type AS product_type, p.title AS product_title
    FROM purchases pu JOIN products p ON p.id = pu.product_id
    WHERE pu.id = ?
  `).get(req.params.id);

  if (!purchase) return res.status(404).json({ error: 'Order not found.' });
  if (purchase.creator_id !== req.creator.id) return res.status(403).json({ error: "You don't own this order." });
  if (purchase.product_type !== 'service') return res.status(400).json({ error: 'This is not a service order.' });
  if (purchase.fulfillment_status !== 'awaiting_delivery') {
    return res.status(409).json({ error: `This order is already ${purchase.fulfillment_status}.` });
  }
  const rawExternalUrl = (req.body.external_url || '').trim();
  const externalUrl = rawExternalUrl ? normalizeExternalUrl(rawExternalUrl) : null;
  if (rawExternalUrl && !externalUrl) return res.status(400).json({ error: 'The delivery link must start with http:// or https://.' });
  const message = (req.body.message || '').trim();
  if (!message) return res.status(400).json({ error: "Describe what you delivered. It's the buyer's (and, if it ever comes to it, a dispute's) only record of what happened." });

  const file = req.file;
  if (file && !storage.isConfigured()) {
    return res.status(503).json({ error: 'File storage is not configured yet. Try again shortly.' });
  }
  let storagePath = null;
  if (file) {
    // Unguarded, a rejected upload (a real R2 hiccup, not hypothetical)
    // left this request hanging forever with no response ever sent —
    // Express 4 doesn't route a rejected promise to the error middleware
    // on its own — and worse here specifically: the order would sit stuck
    // at awaiting_delivery with no sign anything went wrong, since
    // markDelivered() below never even ran.
    try {
      const key = `deliveries/${randomUUID()}${path.extname(file.originalname)}`;
      await storage.uploadBuffer(key, file.buffer, file.mimetype);
      storagePath = storage.publicUrl(key);
    } catch (err) {
      return res.status(502).json({ error: 'Could not upload that file, try again.' });
    }
  }
  markDelivered(purchase.id, {
    message,
    storagePath,
    originalFilename: file ? file.originalname : null,
    externalUrl: externalUrl
  });

  const buyer = db.prepare('SELECT * FROM buyers WHERE id = ?').get(purchase.buyer_id);
  sendEmail(
    buyer.email,
    `Delivered: ${purchase.product_title}`,
    `The seller marked this order delivered:\n\n${message}\n\nCheck it out, then confirm or report a problem from your account within 5 days. After that it releases to the seller automatically.`
  );

  res.json({ ok: true });
});

// POST /api/purchases/:id/confirm — buyer confirms a service delivery,
// releasing the held payment immediately instead of waiting out the
// auto-release window.
router.post('/:id/confirm', requireAuth, (req, res) => {
  const purchase = db.prepare(`
    SELECT pu.*, p.type AS product_type
    FROM purchases pu
    JOIN buyers b ON b.id = pu.buyer_id
    JOIN products p ON p.id = pu.product_id
    WHERE pu.id = ? AND b.user_id = ?
  `).get(req.params.id, req.user.id);

  if (!purchase) return res.status(404).json({ error: 'Order not found.' });
  if (purchase.product_type !== 'service') {
    return res.status(409).json({ error: 'Only a delivered service order can be confirmed here.' });
  }
  if (purchase.fulfillment_status !== 'delivered') {
    return res.status(409).json({ error: 'This order has nothing pending confirmation.' });
  }
  confirmDelivery(purchase.id);
  res.json({ ok: true });
});

// POST /api/purchases/:id/dispute — either order party opens a case. The
// order's funds stay held until an admin resolves it.
router.post('/:id/dispute', requireAuth, (req, res) => {
  sweepAutoReleases();
  const purchase = db.prepare(`
    SELECT pu.*, b.user_id AS buyer_user_id, c.user_id AS seller_user_id,
           p.title AS product_title
    FROM purchases pu
    JOIN buyers b ON b.id = pu.buyer_id
    JOIN products p ON p.id = pu.product_id
    JOIN creators c ON c.id = p.creator_id
    WHERE pu.id = ?
  `).get(req.params.id);

  if (!purchase) return res.status(404).json({ error: 'Order not found.' });
  if (purchase.payment_status !== 'paid') return res.status(409).json({ error: 'Only paid orders can be disputed.' });
  const role = purchase.buyer_user_id === req.user.id ? 'buyer'
    : purchase.seller_user_id === req.user.id ? 'seller' : null;
  if (!role) return res.status(403).json({ error: "You're not part of this order." });
  if (!['awaiting_delivery', 'delivered'].includes(purchase.fulfillment_status)) {
    return res.status(409).json({ error: 'This order can\'t be disputed right now.' });
  }
  const reason = (req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Describe what went wrong.' });
  if (hasOffPlatformContact(reason)) {
    return res.status(400).json({ error: 'Keep dispute details on SCORPIO. Phone numbers, email addresses, and external links are not allowed.' });
  }

  const existing = disputeFor(purchase.id);
  if (existing && existing.status === 'open') {
    return res.status(409).json({ error: 'This order already has an open dispute. Use the case chat to continue it.' });
  }

  const seriousClaim = req.body.serious_claim === true || req.body.serious_claim === 'true';
  const dispute = openDispute(purchase.id, reason, req.user.id, seriousClaim);
  db.prepare(`
    INSERT INTO dispute_messages (dispute_id, user_id, author_role, body)
    VALUES (?, ?, ?, ?)
  `).run(dispute.id, req.user.id, role, reason);

  const parties = db.prepare(`
    SELECT buyer.email AS buyer_email, seller.email AS seller_email, p.title
    FROM purchases pu
    JOIN products p ON p.id = pu.product_id
    JOIN creators c ON c.id = p.creator_id
    LEFT JOIN users seller ON seller.id = c.user_id
    JOIN buyers b ON b.id = pu.buyer_id
    LEFT JOIN users buyer ON buyer.id = b.user_id
    WHERE pu.id = ?
  `).get(purchase.id);
  const notifyEmail = role === 'buyer' ? parties?.seller_email : parties?.buyer_email;
  if (notifyEmail) {
    sendEmail(
      notifyEmail,
      `Dispute opened: ${parties.title}`,
      `A ${role} opened a dispute on this order. The order's funds remain held until SCORPIO reviews the case. Reply in the case chat from your account.`
    );
  }

  res.json({ ok: true, dispute_id: dispute.id });
});

// POST /api/purchases/:id/resend-download
router.post('/:id/resend-download', requireAuth, (req, res) => {
  const purchase = db.prepare(`
    SELECT pu.*, p.title AS product_title
    FROM purchases pu
    JOIN buyers b ON b.id = pu.buyer_id
    JOIN products p ON p.id = pu.product_id
    WHERE pu.id = ? AND b.user_id = ?
  `).get(req.params.id, req.user.id);

  if (!purchase) return res.status(404).json({ error: 'Purchase not found.' });
  if (purchase.payment_status !== 'paid') return res.status(400).json({ error: 'This order is not paid.' });
  if (!productHasFile(purchase.product_id)) return res.status(400).json({ error: 'This product has no file to deliver.' });

  const token = createDownloadToken(purchase.id);
  const url = `${FRONTEND_URL}/api/downloads/${token}`;
  sendEmail(req.user.email, `Your download: ${purchase.product_title}`, `Here's your link: ${url}`);

  res.json({ download_url: `/api/downloads/${token}` });
});

// POST /api/purchases — starts checkout. Requires login: a guest purchase
// can never be linked to an account, which means it could never show up
// again anywhere — no library, no re-download after the immediate
// post-payment page, nothing. Requiring an account here is what makes the
// "your purchases are always there" promise actually true, not just a page
// that happens to work once right after paying.
router.post('/', checkoutLimiter, requireVerified, async (req, res) => {
  const { name, phone, product_slug, amount } = req.body;

  if (!product_slug) {
    return res.status(400).json({ error: 'product_slug is required.' });
  }

  const product = db.prepare("SELECT * FROM products WHERE slug = ? AND status = 'published' AND review_status = 'clear'").get(product_slug);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  // No self-purchase: paying yourself minus the platform fee is pure fee-
  // gaming, and self-reviews would be worthless — every marketplace that
  // takes a cut blocks this for the same reason. It also collapses a
  // genuinely confusing UI state: the same order simultaneously showing an
  // owner's "Edit listing" controls and a buyer's purchase record.
  if (req.creator && req.creator.id === product.creator_id) {
    return res.status(403).json({ error: "You can't buy your own product." });
  }

  // Resolved before the stock check so this buyer's own earlier unpaid
  // attempt on the last unit doesn't count against their retry.
  const buyer = buyerForUser(req.user, name);
  if (!buyer) return res.status(409).json({ error: 'This email is already attached to another account. Contact support.' });

  if (buyerOwnsProduct(buyer.id, product)) {
    return res.status(409).json({ error: 'You already own this. Find it in your library.', already_owned: true });
  }

  const inFlight = db.prepare(`
    SELECT payment_reference FROM purchases
    WHERE buyer_id = ? AND product_id = ? AND payment_status = 'pending' AND payment_reference IS NOT NULL
      AND created_at >= datetime('now', ?)
    ORDER BY id DESC LIMIT 1
  `).get(buyer.id, product.id, `-${DUPLICATE_CHECKOUT_SECONDS} seconds`);
  if (inFlight) {
    return res.status(200).json({ order_id: inFlight.payment_reference, ecocash_status: 'CHECKING', checking_payment_status: true });
  }

  if (isSoldOut(product, { excludeBuyerId: buyer.id })) {
    return res.status(409).json({ error: 'This product is sold out.' });
  }

  let amountMinor = product.price_minor;
  let discountApplied = false;
  if (product.pay_what_you_want) {
    amountMinor = toMinor(amount);
    if (amountMinor === null || amountMinor < (product.min_price_minor || 0)) {
      return res.status(400).json({ error: 'amount must meet the minimum price.' });
    }
  } else if (isPromoActive(product) && promoSlotOpen(product, buyer.id)) {
    // Re-checked here, not just trusted from what the buyer saw on the
    // product page — a "first X buyers" cap can fill up between page load
    // and checkout, and the charge has to reflect reality either way.
    amountMinor = applyDiscount(product.price_minor, product.discount_percent);
    discountApplied = true;
  }
  if (amountMinor < 0 || amountMinor >= 10000000) {
    return res.status(400).json({ error: 'amount must be zero or more, and less than 100,000.' });
  }
  const isFree = amountMinor === 0;

  // EcoCash only enters the picture when money is actually changing hands
  // — a free product (or a pay-what-you-want buyer choosing $0, when the
  // creator's own minimum allows it) has nothing to charge, so there's no
  // phone number to validate or prompt to send.
  if (!isFree) {
    if (!phone) return res.status(400).json({ error: 'phone is required.' });
    if (!isValidSenderPhone(phone)) {
      return res.status(400).json({ error: 'Enter a valid EcoCash number, e.g. 07XXXXXXXX or +2637XXXXXXXX.' });
    }
  }

  const insert = db.prepare(`
    INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_status, discount_applied, fee_minor, net_minor, payer_phone)
    VALUES (?, ?, ?, ?, 'pending', ?, 0, 0, ?)
  `).run(buyer.id, product.id, amountMinor, product.currency, discountApplied ? 1 : 0, isFree ? null : phone);
  const purchaseId = insert.lastInsertRowid;

  if (isFree) {
    // Nothing to charge — skip Dischub/EcoCash entirely and settle the
    // order immediately. markPurchasePaid does the exact same work a real
    // payment completion does (stock count, escrow hold, download token,
    // confirmation email); a free product isn't a special case for any of
    // that, only for how it gets marked paid in the first place.
    markPurchasePaid(purchaseId);
    return res.status(201).json({ free: true, purchase_id: purchaseId });
  }

  // Random suffix so order_id isn't just the sequential purchase id —
  // otherwise anyone could enumerate ZS1, ZS2, ZS3... against the status
  // endpoint below and see other people's order amounts and pay status.
  const orderId = `zs${purchaseId}${randomBytes(4).toString('hex')}`;
  db.prepare('UPDATE purchases SET payment_reference = ? WHERE id = ?').run(orderId, purchaseId);

  // Non-redirecting flow: this triggers a real EcoCash prompt straight to
  // the buyer's phone. There's no pay_url to send them to — the frontend
  // just moves to /payment/return?order_id=... on the same site and polls
  // GET /api/purchases/status/:orderId (below) until it resolves.
  const order = await createOrder({ orderId, sender: phone, amountMinor, currency: product.currency });

  if (!order.success && order.uncertain) {
    return res.status(201).json({
      order_id: orderId,
      ecocash_status: 'CHECKING',
      checking_payment_status: true
    });
  }

  if (!order.success) {
    markPurchaseFailed(purchaseId);
    return res.status(502).json({ error: order.error });
  }

  res.status(201).json({ order_id: orderId, ecocash_status: order.ecocashStatus });
});

// GET /api/purchases/status/:orderId — the buyer's browser lands back here
// (via payment_return) after Dischub, and this is what actually confirms
// payment: a live poll against Dischub's status endpoint, not anything the
// buyer's browser claims. Same route a resend/retry can hit repeatedly —
// markPurchasePaid/Failed are idempotent, so repeated polls are safe.
//
// One order_id can cover several purchase rows (a cart checkout), so this
// always deals in a list — a direct single-product buy is just the
// one-item case of the same shape, not a separate code path.
router.get('/status/:orderId', orderLookupLimiter, async (req, res) => {
  const purchases = db.prepare(`
        SELECT pu.*, p.title AS product_title, p.slug AS product_slug, p.type AS product_type,
          c.handle AS creator_handle
    FROM purchases pu
    JOIN products p ON p.id = pu.product_id
    JOIN creators c ON c.id = p.creator_id
    WHERE pu.payment_reference = ?
  `).all(req.params.orderId);

  if (purchases.length === 0) return res.status(404).json({ error: 'Order not found.' });

  // Anyone holding the order id can see whether it was paid, because that id
  // sits in the page URL. The goods themselves go only to the buyer's account.
  const isBuyer = !!req.user && !!db.prepare('SELECT 1 FROM buyers WHERE id = ? AND user_id = ?')
    .get(purchases[0].buyer_id, req.user.id);

  const latestIssueStmt = db.prepare(
    'SELECT issue_number, title, published_at FROM issues WHERE product_id = ? ORDER BY issue_number DESC LIMIT 1'
  );
  let current = purchases;
  if (purchases.some(p => p.payment_status === 'pending')) {
    const result = await checkOrderStatus(req.params.orderId);
    if (result.status === 'success') {
      try {
        current = purchases.map(p => markPurchasePaid(p.id));
      } catch (err) {
        console.error('[payment completion]', err.message);
        return res.status(503).json({ error: 'Payment is confirmed; access is still being prepared. Keep this page open while we retry.' });
      }
    } else if (result.status === 'failed') current = purchases.map(p => markPurchaseFailed(p.id));
    // result.status === 'pending' or 'error': leave as pending, buyer/page can poll again
  }

  const status = current.every(p => p.payment_status === 'paid') ? 'paid'
    : current.some(p => p.payment_status === 'failed') ? 'failed'
    : 'pending';

  res.json({
    status,
    login_required: !isBuyer,
    currency: purchases[0].currency,
    total_amount_minor: current.reduce((sum, p) => sum + p.amount_minor, 0),
    items: current.map((p, i) => ({
      product_title: purchases[i].product_title,
      product_slug: purchases[i].product_slug,
      creator_handle: purchases[i].creator_handle,
      product_type: p.product_type,
      amount_minor: p.amount_minor,
      currency: p.currency,
      ...(isBuyer ? fileAccessFor(p) : { download_url: null, view_url: null, is_video: false, is_audio: false, is_external: false, license_key: null }),
      service: isBuyer ? serviceStatusFor(p) : null,
      latest_issue: isBuyer && ['serial', 'subscription'].includes(p.product_type) && p.payment_status === 'paid'
        ? latestIssueStmt.get(p.product_id) || null
        : null
    }))
  });
});

// POST /api/purchases/dischub/callback — the webhook. Only reachable once
// this is deployed behind a real https domain and DISCHUB_CALLBACK_URL is
// set (Dischub requires https, so this is inert on localhost). The webhook
// body's claimed status is never trusted directly — order_id is used to
// pull fresh, authoritative status straight from Dischub instead, since a
// POST to a public URL can't be assumed genuine on its own.
router.post('/dischub/callback', orderLookupLimiter, async (req, res) => {
  const orderId = req.body?.order_id;
  if (!orderId) return res.status(400).json({ error: 'order_id is required.' });

  const purchases = db.prepare('SELECT * FROM purchases WHERE payment_reference = ?').all(orderId);
  if (purchases.length === 0) return res.status(404).json({ error: 'Order not found.' });

  if (purchases.some(p => p.payment_status === 'pending')) {
    const result = await checkOrderStatus(orderId);
    if (result.status === 'success') {
      try {
        purchases.forEach(p => markPurchasePaid(p.id));
      } catch (err) {
        console.error('[payment callback completion]', err.message);
        return res.status(503).json({ error: 'Payment is confirmed; purchase access is still being prepared.' });
      }
    } else if (result.status === 'failed') purchases.forEach(p => markPurchaseFailed(p.id));
  }

  res.json({ ok: true });
});

module.exports = router;
