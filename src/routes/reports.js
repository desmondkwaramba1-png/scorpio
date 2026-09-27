// Product-only and general reports. Paid-order concerns use the held-funds
// dispute flow at POST /api/purchases/:id/dispute.
const express = require('express');
const db = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { reportLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/reports, { purchase_id, reason }. The reporter must actually
// be a party to the order (the buyer who paid, or the creator who sold
// it), anyone else, 403. Which one they are becomes reporter_role,
// stored so the admin queue can show "buyer says" vs "seller says"
// without re-deriving it.
router.post('/', requireAuth, (req, res) => {
  const purchaseId = Number(req.body.purchase_id);
  const reason = (req.body.reason || '').trim();
  if (!purchaseId) return res.status(400).json({ error: 'purchase_id is required.' });
  if (!reason) return res.status(400).json({ error: 'Describe what went wrong.' });
  if (reason.length > 2000) return res.status(400).json({ error: 'Keep it under 2000 characters.' });

  const purchase = db.prepare(`
    SELECT pu.id, pu.buyer_id, p.creator_id, p.title AS product_title,
           b.user_id AS buyer_user_id, c.user_id AS creator_user_id
    FROM purchases pu
    JOIN products p ON p.id = pu.product_id
    JOIN buyers b ON b.id = pu.buyer_id
    JOIN creators c ON c.id = p.creator_id
    WHERE pu.id = ?
  `).get(purchaseId);
  if (!purchase) return res.status(404).json({ error: 'Order not found.' });

  let reporterRole;
  if (purchase.buyer_user_id === req.user.id) reporterRole = 'buyer';
  else if (purchase.creator_user_id === req.user.id) reporterRole = 'creator';
  else return res.status(403).json({ error: "You're not part of this order." });

  const existing = db.prepare(`SELECT id FROM reports WHERE purchase_id = ? AND status = 'open'`).get(purchaseId);
  if (existing) return res.status(409).json({ error: 'This order already has an open report, no need to send another.' });

  const result = db.prepare(`
    INSERT INTO reports (purchase_id, reporter_user_id, reporter_role, reason)
    VALUES (?, ?, ?, ?)
  `).run(purchaseId, req.user.id, reporterRole, reason);

  res.status(201).json({ id: result.lastInsertRowid, status: 'open' });
});

// POST /api/reports/product, { product_id, reason }. No purchase
// required: this is for exactly the case the purchase-scoped report above
// can't cover, a seller flagging another seller's listing as a copy or
// otherwise a problem, or any logged-in user flagging a product as
// misleading, before ever buying it. Any logged-in user except the
// product's own owner (reporting your own listing makes no sense, use
// the dashboard to edit or unpublish it instead).
router.post('/product', requireAuth, (req, res) => {
  const productId = Number(req.body.product_id);
  const reason = (req.body.reason || '').trim();
  const seriousClaim = req.body.serious_claim === true || req.body.serious_claim === 'true';
  if (!productId) return res.status(400).json({ error: 'product_id is required.' });
  if (!reason) return res.status(400).json({ error: 'Describe the problem.' });
  if (reason.length > 2000) return res.status(400).json({ error: 'Keep it under 2000 characters.' });

  const product = db.prepare(`
    SELECT p.id, p.title, c.user_id AS owner_user_id
    FROM products p JOIN creators c ON c.id = p.creator_id
    WHERE p.id = ?
  `).get(productId);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  if (product.owner_user_id === req.user.id) {
    return res.status(403).json({ error: "You can't report your own product." });
  }

  const existing = db.prepare(`SELECT id FROM reports WHERE product_id = ? AND reporter_user_id = ? AND status = 'open'`)
    .get(productId, req.user.id);
  if (existing) return res.status(409).json({ error: 'You already have an open report on this product.' });

  const reporterRole = req.creator ? 'creator' : 'buyer';
  const result = db.prepare(`
    INSERT INTO reports (product_id, reporter_user_id, reporter_role, reason, serious_claim)
    VALUES (?, ?, ?, ?, ?)
  `).run(productId, req.user.id, reporterRole, reason, seriousClaim ? 1 : 0);

  res.status(201).json({ id: result.lastInsertRowid, status: 'open' });
});

// POST /api/reports/general, { subject, reason, email }. No purchase, no
// product, no login required, this is the catch-all for a problem that
// doesn't fit the two scoped report types above: a broken page, "I can't
// log in," general feedback. Deliberately open to logged-out visitors,
// since requiring login here would rule out reporting the exact class of
// problem ("I can't log in") this exists to catch. A logged-in reporter's
// account email is used automatically; a logged-out one has to give an
// email so there's any way to follow up.
router.post('/general', reportLimiter, (req, res) => {
  const subject = (req.body.subject || '').trim();
  const reason = (req.body.reason || '').trim();
  const email = req.user ? req.user.email : (req.body.email || '').trim();

  if (!reason) return res.status(400).json({ error: 'Describe what happened.' });
  if (reason.length > 2000) return res.status(400).json({ error: 'Keep it under 2000 characters.' });
  if (subject.length > 200) return res.status(400).json({ error: 'Keep the subject under 200 characters.' });
  if (!req.user && !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email so we can follow up.' });
  }

  const reporterRole = req.user ? (req.creator ? 'creator' : 'buyer') : null;
  const result = db.prepare(`
    INSERT INTO reports (reporter_user_id, reporter_role, reporter_email, subject, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user ? req.user.id : null, reporterRole, email || null, subject || null, reason);

  res.status(201).json({ id: result.lastInsertRowid, status: 'open' });
});

module.exports = router;
