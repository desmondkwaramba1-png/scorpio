const express = require('express');
const { timingSafeEqual } = require('crypto');
const db = require('../db/schema');
const { resolveDispute } = require('../lib/escrow');

const router = express.Router();

// No admin accounts/roles exist in this app yet — disputes are resolved
// manually by whoever holds ADMIN_KEY (the platform operator), not through
// a login. If ADMIN_KEY isn't set, these routes refuse to do anything
// rather than silently accepting an empty-string match.
//
// A plain !== leaks how many leading characters matched through response
// timing — small for a single guess, but this key is the ENTIRE access
// control for this route, worth closing properly. timingSafeEqual needs
// equal-length buffers, so the length check has to happen first (and
// separately) — that comparison alone leaks nothing an attacker doesn't
// already know, since ADMIN_KEY's length isn't the secret.
function requireAdmin(req, res, next) {
  const key = process.env.ADMIN_KEY;
  if (!key) return res.status(501).json({ error: 'ADMIN_KEY is not set. Dispute resolution is not available.' });
  const provided = req.headers['x-admin-key'] || '';
  const keyBuf = Buffer.from(key);
  const providedBuf = Buffer.from(provided);
  const valid = keyBuf.length === providedBuf.length && timingSafeEqual(keyBuf, providedBuf);
  if (!valid) return res.status(403).json({ error: 'Invalid admin key.' });
  next();
}

// GET /api/admin/disputes — the whole queue. Everything a human needs to
// judge a dispute without touching the database directly: what was bought,
// who from, what the buyer says went wrong, and what the seller claims
// they delivered (if anything).
router.get('/disputes', requireAdmin, (req, res) => {
  const disputes = db.prepare(`
    SELECT d.id AS dispute_id, d.reason, d.status AS dispute_status, d.created_at AS disputed_at,
           pu.id AS purchase_id, pu.amount_minor, pu.currency, pu.created_at AS purchased_at,
           p.title AS product_title, p.slug AS product_slug,
           buyer.name AS buyer_name, buyer.email AS buyer_email,
           c.name AS seller_name, c.handle AS seller_handle, c.email AS seller_email
    FROM service_disputes d
    JOIN purchases pu ON pu.id = d.purchase_id
    JOIN products p ON p.id = pu.product_id
    JOIN buyers buyer ON buyer.id = pu.buyer_id
    JOIN creators c ON c.id = p.creator_id
    WHERE d.status = 'open'
    ORDER BY d.created_at ASC
  `).all();

  for (const d of disputes) {
    d.delivery = db.prepare('SELECT message, external_url, storage_path FROM service_deliveries WHERE purchase_id = ? ORDER BY id DESC LIMIT 1').get(d.purchase_id) || null;
  }

  res.json(disputes);
});

// POST /api/admin/disputes/:id/resolve — { resolution: 'refund'|'release', note }
router.post('/disputes/:id/resolve', requireAdmin, (req, res) => {
  const { resolution, note } = req.body;
  if (!['refund', 'release'].includes(resolution)) {
    return res.status(400).json({ error: "resolution must be 'refund' or 'release'." });
  }
  const dispute = resolveDispute(req.params.id, resolution, note);
  if (!dispute) return res.status(404).json({ error: 'Dispute not found, or already resolved.' });

  // "Refund" only changes the seller's wallet accounting (see wallet.js) —
  // actually returning the buyer's EcoCash payment is a manual step outside
  // this app, same honesty as wallet.js's withdraw stub.
  res.json({
    ok: true,
    dispute,
    note: resolution === 'refund'
      ? 'Marked refunded. This money will never count toward the seller\'s wallet. Send the buyer their EcoCash refund manually; nothing here moves it.'
      : 'Released to the seller\'s wallet.'
  });
});

// GET /api/admin/flagged-products — the content-verification queue: real,
// automated findings only (a duplicate file hash, a type/extension
// mismatch, a page count that contradicts the listing's own description —
// see contentVerification.js). Nothing here is an AI opinion or a
// judgment call; flag_reason is always traceable to one of those specific
// mechanical checks.
router.get('/flagged-products', requireAdmin, (req, res) => {
  const products = db.prepare(`
    SELECT p.id, p.title, p.slug, p.category, p.flag_reason, p.created_at,
           c.name AS creator_name, c.handle AS creator_handle,
           pf.file_hash, pf.detected_mime, pf.page_count, pf.original_filename
    FROM products p
    JOIN creators c ON c.id = p.creator_id
    LEFT JOIN product_files pf ON pf.product_id = p.id
    WHERE p.review_status = 'flagged'
    ORDER BY p.created_at DESC
  `).all();
  res.json(products);
});

// POST /api/admin/products/:id/clear-flag — a human looked at it and it's
// fine; puts it back in normal circulation. Doesn't touch the file_hash on
// record, so a genuine future duplicate of THIS file still flags normally.
router.post('/products/:id/clear-flag', requireAdmin, (req, res) => {
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  db.prepare("UPDATE products SET review_status = 'clear', flag_reason = NULL WHERE id = ?").run(product.id);
  res.json({ ok: true });
});

module.exports = router;
