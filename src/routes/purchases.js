const express = require('express');
const multer = require('multer');
const path = require('path');
const { randomUUID, randomBytes } = require('crypto');
const db = require('../db/schema');
const { createOrder, checkOrderStatus, isValidSenderPhone } = require('../services/payment');
const { toMinor } = require('../lib/money');
const { isPromoActive, applyDiscount } = require('../lib/promotions');
const { checkoutLimiter, orderLookupLimiter } = require('../middleware/rateLimit');
const { requireAuth, requireCreator } = require('../middleware/auth');
const { createDownloadToken, getActiveTokenForPurchase, productHasFile, getProductFile, isVideoFilename, isAudioFilename } = require('../lib/downloads');
const { productHasKeys, unclaimedCount, keyForPurchase } = require('../lib/licenseKeys');
const { sweepAutoReleases, deliveryFor, disputeFor, markDelivered, confirmDelivery, openDispute } = require('../lib/escrow');
const { sendEmail } = require('../lib/notify');
const { markPurchasePaid, markPurchaseFailed } = require('../lib/purchaseCompletion');
const storage = require('../lib/storage');

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
  if (purchase.payment_status !== 'paid') {
    return { download_url: null, view_url: null, is_video: false, is_audio: false, license_key: null };
  }
  const file = getProductFile(purchase.product_id);
  const keyRow = keyForPurchase(purchase.id);

  let downloadUrl = null, viewUrl = null, isVideo = false, isAudio = false;
  if (file) {
    const token = getActiveTokenForPurchase(purchase.id) || { token: createDownloadToken(purchase.id) };
    downloadUrl = `/api/downloads/${token.token}`;
    viewUrl = file.kind === 'external_link' ? file.external_url : `/api/downloads/${token.token}/view`;
    isVideo = file.kind === 'upload' && isVideoFilename(file.original_filename);
    isAudio = file.kind === 'upload' && isAudioFilename(file.original_filename);
  }

  return { download_url: downloadUrl, view_url: viewUrl, is_video: isVideo, is_audio: isAudio, license_key: keyRow ? keyRow.key_value : null };
}

// A product is "sold out" if either stock signal says so: an explicit
// quantity_limit, or — for software delivered by key — simply running out
// of unclaimed keys, even when no quantity_limit was ever set.
function isSoldOut(product) {
  if (product.quantity_limit !== null && product.quantity_sold >= product.quantity_limit) return true;
  if (productHasKeys(product.id) && unclaimedCount(product.id) <= 0) return true;
  return false;
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
    dispute: dispute ? { reason: dispute.reason, status: dispute.status, resolution_note: dispute.resolution_note } : null
  };
}

// GET /api/purchases/mine — a logged-in buyer's own order history. Includes
// the seller's contact info (email always; phone when their account has
// one) — a buyer who's actually paid has standing to follow up directly,
// not just wait silently on a service order.
router.get('/mine', requireAuth, (req, res) => {
  sweepAutoReleases();

  const purchases = db.prepare(`
    SELECT pu.*, p.title AS product_title, p.slug AS product_slug, p.cover_path AS product_cover_path,
           p.delivery_days AS delivery_days, p.type AS product_type,
           c.name AS creator_name, c.handle AS creator_handle, u.email AS creator_email, u.phone AS creator_phone,
           EXISTS(SELECT 1 FROM reports r WHERE r.purchase_id = pu.id AND r.status = 'open') AS has_open_report
    FROM purchases pu
    JOIN buyers b ON b.id = pu.buyer_id
    JOIN products p ON p.id = pu.product_id
    JOIN creators c ON c.id = p.creator_id
    LEFT JOIN users u ON u.id = c.user_id
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
  const message = (req.body.message || '').trim();
  if (!message) return res.status(400).json({ error: "Describe what you delivered. It's the buyer's (and, if it ever comes to it, a dispute's) only record of what happened." });

  const file = req.file;
  if (file && !storage.isConfigured()) {
    return res.status(503).json({ error: 'File storage is not configured yet. Try again shortly.' });
  }
  let storagePath = null;
  if (file) {
    const key = `deliveries/${randomUUID()}${path.extname(file.originalname)}`;
    await storage.uploadBuffer(key, file.buffer, file.mimetype);
    storagePath = storage.publicUrl(key);
  }
  markDelivered(purchase.id, {
    message,
    storagePath,
    originalFilename: file ? file.originalname : null,
    externalUrl: req.body.external_url || null
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
    SELECT pu.* FROM purchases pu JOIN buyers b ON b.id = pu.buyer_id
    WHERE pu.id = ? AND b.user_id = ?
  `).get(req.params.id, req.user.id);

  if (!purchase) return res.status(404).json({ error: 'Order not found.' });
  if (purchase.fulfillment_status !== 'delivered') {
    return res.status(409).json({ error: 'This order has nothing pending confirmation.' });
  }
  confirmDelivery(purchase.id);
  res.json({ ok: true });
});

// POST /api/purchases/:id/dispute — buyer reports a problem: never
// delivered, or delivered but not what was promised. Holds the money —
// resolution is manual for now (see escrow.js resolveDispute).
router.post('/:id/dispute', requireAuth, (req, res) => {
  const purchase = db.prepare(`
    SELECT pu.* FROM purchases pu JOIN buyers b ON b.id = pu.buyer_id
    WHERE pu.id = ? AND b.user_id = ?
  `).get(req.params.id, req.user.id);

  if (!purchase) return res.status(404).json({ error: 'Order not found.' });
  if (!['awaiting_delivery', 'delivered'].includes(purchase.fulfillment_status)) {
    return res.status(409).json({ error: 'This order can\'t be disputed right now.' });
  }
  const reason = (req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Describe what went wrong.' });

  openDispute(purchase.id, reason);
  res.json({ ok: true });
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
router.post('/', checkoutLimiter, requireAuth, async (req, res) => {
  const { email, name, phone, product_slug, amount } = req.body;

  if (!email || !product_slug) {
    return res.status(400).json({ error: 'email and product_slug are required.' });
  }

  const product = db.prepare("SELECT * FROM products WHERE slug = ? AND status = 'published'").get(product_slug);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  // No self-purchase: paying yourself minus the platform fee is pure fee-
  // gaming, and self-reviews would be worthless — every marketplace that
  // takes a cut blocks this for the same reason. It also collapses a
  // genuinely confusing UI state: the same order simultaneously showing an
  // owner's "Edit listing" controls and a buyer's purchase record.
  if (req.creator && req.creator.id === product.creator_id) {
    return res.status(403).json({ error: "You can't buy your own product." });
  }

  if (isSoldOut(product)) {
    return res.status(409).json({ error: 'This product is sold out.' });
  }

  let amountMinor = product.price_minor;
  let discountApplied = false;
  if (product.pay_what_you_want) {
    amountMinor = toMinor(amount);
    if (amountMinor === null || amountMinor < (product.min_price_minor || 0)) {
      return res.status(400).json({ error: 'amount must meet the minimum price.' });
    }
  } else if (isPromoActive(product)) {
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
      return res.status(400).json({ error: 'Enter a valid EcoCash number, e.g. 0780070488 or +263780070488.' });
    }
  }

  let buyer = db.prepare('SELECT * FROM buyers WHERE email = ?').get(email);
  if (!buyer) {
    const result = db.prepare('INSERT INTO buyers (name, email, user_id) VALUES (?, ?, ?)')
      .run(name || null, email, req.user.id);
    buyer = db.prepare('SELECT * FROM buyers WHERE id = ?').get(result.lastInsertRowid);
  } else if (!buyer.user_id) {
    // A previously-guest email (from before this route required login)
    // checking out for the first time as a real account — link it.
    db.prepare('UPDATE buyers SET user_id = ? WHERE id = ?').run(req.user.id, buyer.id);
  }

  const insert = db.prepare(`
    INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_status, discount_applied)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(buyer.id, product.id, amountMinor, product.currency, discountApplied ? 1 : 0);
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
    SELECT pu.*, p.title AS product_title, p.slug AS product_slug, c.handle AS creator_handle
    FROM purchases pu
    JOIN products p ON p.id = pu.product_id
    JOIN creators c ON c.id = p.creator_id
    WHERE pu.payment_reference = ?
  `).all(req.params.orderId);

  if (purchases.length === 0) return res.status(404).json({ error: 'Order not found.' });

  let current = purchases;
  if (purchases[0].payment_status === 'pending') {
    const result = await checkOrderStatus(req.params.orderId);
    if (result.status === 'success') current = purchases.map(p => markPurchasePaid(p.id));
    else if (result.status === 'failed') current = purchases.map(p => markPurchaseFailed(p.id));
    // result.status === 'pending' or 'error': leave as pending, buyer/page can poll again
  }

  const status = current.every(p => p.payment_status === 'paid') ? 'paid'
    : current.some(p => p.payment_status === 'failed') ? 'failed'
    : 'pending';

  res.json({
    status,
    currency: purchases[0].currency,
    total_amount_minor: current.reduce((sum, p) => sum + p.amount_minor, 0),
    items: current.map((p, i) => ({
      product_title: purchases[i].product_title,
      product_slug: purchases[i].product_slug,
      creator_handle: purchases[i].creator_handle,
      amount_minor: p.amount_minor,
      currency: p.currency,
      ...fileAccessFor(p),
      service: serviceStatusFor(p)
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

  if (purchases[0].payment_status === 'pending') {
    const result = await checkOrderStatus(orderId);
    if (result.status === 'success') purchases.forEach(p => markPurchasePaid(p.id));
    else if (result.status === 'failed') purchases.forEach(p => markPurchaseFailed(p.id));
  }

  res.json({ ok: true });
});

module.exports = router;
