const express = require('express');
const { timingSafeEqual } = require('crypto');
const db = require('../db/schema');
const { resolveDispute, sweepAutoReleases } = require('../lib/escrow');
const { balancesFor } = require('../lib/walletBalances');
const { netOf } = require('../lib/fees');

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
           c.name AS seller_name, c.handle AS seller_handle, cu.email AS seller_email
    FROM service_disputes d
    JOIN purchases pu ON pu.id = d.purchase_id
    JOIN products p ON p.id = pu.product_id
    JOIN buyers buyer ON buyer.id = pu.buyer_id
    JOIN creators c ON c.id = p.creator_id
    LEFT JOIN users cu ON cu.id = c.user_id
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

// GET /api/admin/reports — general problem reports, two kinds in one
// queue (see migrations/027/028_reports*.sql): an order-scoped report
// (purchase_id set — buyer or seller flagging something about a specific
// order) and a product-only report (product_id set, no order at all — one
// seller flagging another's listing, e.g. as a copy). purchase_id is
// LEFT JOINed rather than required, and the effective product is
// COALESCE(rp.product_id, pu.product_id) since either can supply it.
router.get('/reports', requireAdmin, (req, res) => {
  const reports = db.prepare(`
    SELECT rp.id AS report_id, rp.reason, rp.status AS report_status, rp.reporter_role, rp.created_at AS reported_at,
           pu.id AS purchase_id, pu.amount_minor, pu.currency, pu.created_at AS purchased_at,
           p.title AS product_title, p.slug AS product_slug,
           buyer.name AS buyer_name, buyer.email AS buyer_email,
           c.name AS seller_name, c.handle AS seller_handle, cu.email AS seller_email,
           reporter.email AS reporter_email
    FROM reports rp
    LEFT JOIN purchases pu ON pu.id = rp.purchase_id
    JOIN products p ON p.id = COALESCE(rp.product_id, pu.product_id)
    LEFT JOIN buyers buyer ON buyer.id = pu.buyer_id
    JOIN creators c ON c.id = p.creator_id
    LEFT JOIN users cu ON cu.id = c.user_id
    LEFT JOIN users reporter ON reporter.id = rp.reporter_user_id
    WHERE rp.status = 'open'
    ORDER BY rp.created_at ASC
  `).all();

  res.json(reports);
});

// POST /api/admin/reports/:id/resolve — { note }. This queue doesn't hold
// or move any money (unlike /disputes, which sits on top of the escrow
// system) — resolving just records that a human looked at it and closes
// it out of the open queue.
router.post('/reports/:id/resolve', requireAdmin, (req, res) => {
  const note = (req.body.note || '').trim();
  const result = db.prepare(`
    UPDATE reports SET status = 'resolved', admin_note = ?, resolved_at = datetime('now')
    WHERE id = ? AND status = 'open'
  `).run(note || null, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Report not found, or already resolved.' });
  res.json({ ok: true });
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

// GET /api/admin/overview — the marketing/ops snapshot: growth, revenue,
// what's actually selling, who just signed up. Real numbers pulled straight
// from the same tables everything else uses, not a separate analytics
// pipeline that could drift from reality.
router.get('/overview', requireAdmin, (req, res) => {
  sweepAutoReleases();

  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) AS total_users,
      (SELECT COUNT(*) FROM creators) AS total_creators,
      (SELECT COUNT(*) FROM buyers) AS total_buyers,
      (SELECT COUNT(*) FROM products WHERE status = 'published') AS published_products,
      (SELECT COUNT(*) FROM products) AS total_products,
      (SELECT COUNT(*) FROM purchases WHERE payment_status = 'paid') AS total_orders
  `).get();

  const grossMinor = db.prepare(`SELECT COALESCE(SUM(amount_minor),0) AS n FROM purchases WHERE payment_status = 'paid'`).get().n;
  const feeMinor = netOf(grossMinor).fee_minor;

  const signups7 = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now','-7 days')`).get().n;
  const signups30 = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now','-30 days')`).get().n;
  const orders7 = db.prepare(`SELECT COUNT(*) AS n FROM purchases WHERE payment_status='paid' AND created_at >= datetime('now','-7 days')`).get().n;
  const revenue7 = db.prepare(`SELECT COALESCE(SUM(amount_minor),0) AS n FROM purchases WHERE payment_status='paid' AND created_at >= datetime('now','-7 days')`).get().n;

  const topProducts = db.prepare(`
    SELECT p.id, p.title, p.slug, p.category, c.name AS creator_name, c.handle AS creator_handle,
           COUNT(pu.id) AS order_count, COALESCE(SUM(pu.amount_minor),0) AS revenue_minor
    FROM products p
    JOIN creators c ON c.id = p.creator_id
    JOIN purchases pu ON pu.product_id = p.id AND pu.payment_status = 'paid'
    GROUP BY p.id
    ORDER BY revenue_minor DESC
    LIMIT 5
  `).all();

  const topCreators = db.prepare(`
    SELECT c.id, c.name, c.handle, u.email, c.verified,
           COUNT(pu.id) AS order_count, COALESCE(SUM(pu.amount_minor),0) AS revenue_minor
    FROM creators c
    LEFT JOIN users u ON u.id = c.user_id
    JOIN products p ON p.creator_id = c.id
    JOIN purchases pu ON pu.product_id = p.id AND pu.payment_status = 'paid'
    GROUP BY c.id
    ORDER BY revenue_minor DESC
    LIMIT 5
  `).all();

  const recentSignups = db.prepare(`
    SELECT u.id, u.name, u.username, u.email, u.phone, u.created_at,
           EXISTS(SELECT 1 FROM creators WHERE user_id = u.id) AS is_creator
    FROM users u ORDER BY u.created_at DESC LIMIT 10
  `).all();

  res.json({
    ...totals,
    gross_revenue_minor: grossMinor,
    platform_fees_minor: feeMinor,
    signups_last_7_days: signups7,
    signups_last_30_days: signups30,
    orders_last_7_days: orders7,
    revenue_last_7_days_minor: revenue7,
    top_products: topProducts,
    top_creators: topCreators,
    recent_signups: recentSignups
  });
});

// GET /api/admin/sellers — every creator, with real contact info and their
// current wallet balances (same balancesFor() the creator's own Wallet page
// uses — never a separately-computed number that could disagree with it).
router.get('/sellers', requireAdmin, (req, res) => {
  sweepAutoReleases();

  const creators = db.prepare(`
    SELECT c.id, c.name, c.handle, u.email, c.payout_ecocash_number, c.verified, c.created_at,
           u.phone,
           (SELECT COUNT(*) FROM products WHERE creator_id = c.id) AS product_count,
           (SELECT COUNT(*) FROM products WHERE creator_id = c.id AND status = 'published') AS published_count
    FROM creators c
    LEFT JOIN users u ON u.id = c.user_id
    ORDER BY c.created_at DESC
  `).all();

  res.json(creators.map(c => ({ ...c, ...balancesFor(c.id) })));
});

// GET /api/admin/buyers — every buyer account, with real contact info and
// what they've actually spent.
router.get('/buyers', requireAdmin, (req, res) => {
  const buyers = db.prepare(`
    SELECT b.id, b.name, b.email, b.created_at, u.phone,
           (SELECT COUNT(*) FROM purchases WHERE buyer_id = b.id AND payment_status = 'paid') AS order_count,
           (SELECT COALESCE(SUM(amount_minor),0) FROM purchases WHERE buyer_id = b.id AND payment_status = 'paid') AS total_spent_minor
    FROM buyers b
    LEFT JOIN users u ON u.id = b.user_id
    ORDER BY b.created_at DESC
  `).all();
  res.json(buyers);
});

// GET /api/admin/payouts — exactly who to pay this Friday and how much.
// "ready" has a payout number on file; "blocked" has money owed but
// nowhere to send it yet, worth chasing separately rather than silently
// skipping.
router.get('/payouts', requireAdmin, (req, res) => {
  sweepAutoReleases();

  const creators = db.prepare('SELECT id, name, handle, email, payout_ecocash_number FROM creators').all();
  const owed = creators
    .map(c => ({ ...c, ...balancesFor(c.id) }))
    .filter(c => c.available_minor > 0)
    .sort((a, b) => b.available_minor - a.available_minor);

  res.json({
    total_due_minor: owed.reduce((sum, c) => sum + c.available_minor, 0),
    ready: owed.filter(c => c.payout_ecocash_number),
    blocked: owed.filter(c => !c.payout_ecocash_number)
  });
});

// POST /api/admin/payouts/:creatorId/mark-paid — records that a payout was
// actually sent (by hand, via EcoCash, outside this app — see payouts.sql).
// Doesn't move any real money itself, same honesty as every other stub-
// first payment surface in this app; it's the record that stops the same
// amount from showing as owed again next week.
router.post('/payouts/:creatorId/mark-paid', requireAdmin, (req, res) => {
  const creator = db.prepare('SELECT id FROM creators WHERE id = ?').get(req.params.creatorId);
  if (!creator) return res.status(404).json({ error: 'Creator not found.' });

  const amountMinor = Number(req.body?.amount_minor);
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    return res.status(400).json({ error: 'amount_minor must be a positive integer.' });
  }

  const { available_minor: availableMinor } = balancesFor(creator.id);
  if (amountMinor > availableMinor) {
    return res.status(400).json({ error: `That's more than this creator's available balance (${availableMinor} minor units).` });
  }

  db.prepare('INSERT INTO payouts (creator_id, amount_minor, note) VALUES (?, ?, ?)')
    .run(creator.id, amountMinor, (req.body?.note || '').trim() || null);

  res.status(201).json({ ok: true, ...balancesFor(creator.id) });
});

// GET /api/admin/payouts/history — a running log across every creator, most
// recent first, for "did we actually pay X last week" questions.
router.get('/payouts/history', requireAdmin, (req, res) => {
  const history = db.prepare(`
    SELECT po.id, po.amount_minor, po.note, po.paid_at, c.id AS creator_id, c.name AS creator_name, c.handle AS creator_handle
    FROM payouts po JOIN creators c ON c.id = po.creator_id
    ORDER BY po.paid_at DESC
    LIMIT 100
  `).all();
  res.json(history);
});

module.exports = router;
