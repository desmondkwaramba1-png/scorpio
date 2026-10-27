const express = require('express');
const { timingSafeEqual } = require('crypto');
const db = require('../db/schema');
const { resolveDispute, sweepAutoReleases } = require('../lib/escrow');
const { balancesFor, remainingNetByPurchaseFor } = require('../lib/walletBalances');
const { netOf } = require('../lib/fees');
const { adminLimiter } = require('../middleware/rateLimit');
const { sendRenewalReminders } = require('../lib/subscriptions');

const router = express.Router();
// Every /api/admin/* route in this router — closes off unlimited guessing
// against ADMIN_KEY (see requireAdmin below), which timingSafeEqual alone
// doesn't address.
router.use(adminLimiter);

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
    SELECT d.id AS dispute_id, d.reason, d.serious_claim, d.status AS dispute_status, d.created_at AS disputed_at,
           pu.id AS purchase_id, pu.amount_minor, pu.currency, pu.created_at AS purchased_at,
           p.id AS product_id, p.title AS product_title, p.slug AS product_slug,
           (SELECT COUNT(*) FROM service_disputes rd JOIN purchases rp ON rp.id = rd.purchase_id WHERE rp.product_id = p.id AND rd.status = 'open') AS open_product_disputes,
           buyer.name AS buyer_name, buyer.email AS buyer_email,
           CASE WHEN d.opened_by_user_id = buyer.user_id THEN 'buyer' ELSE 'seller' END AS opened_by_role,
           c.id AS creator_id, c.name AS seller_name, c.handle AS seller_handle, cu.email AS seller_email
    FROM service_disputes d
    JOIN purchases pu ON pu.id = d.purchase_id
    JOIN products p ON p.id = pu.product_id
    JOIN buyers buyer ON buyer.id = pu.buyer_id
    JOIN creators c ON c.id = p.creator_id
    LEFT JOIN users cu ON cu.id = c.user_id
    WHERE d.status = 'open'
    ORDER BY d.created_at ASC
  `).all();

  const creatorBalances = new Map();
  for (const d of disputes) {
    d.order_funds_held_minor = netOf(d.amount_minor).net_minor;
    if (!creatorBalances.has(d.creator_id)) creatorBalances.set(d.creator_id, balancesFor(d.creator_id));
    const productHold = creatorBalances.get(d.creator_id).balances_by_currency[d.currency]?.product_holds
      .find(hold => hold.product_id === d.product_id);
    d.product_funds_held_minor = productHold?.amount_minor || 0;
    d.delivery = db.prepare('SELECT message, external_url, storage_path FROM service_deliveries WHERE purchase_id = ? ORDER BY id DESC LIMIT 1').get(d.purchase_id) || null;
    d.timeline = [
      ...db.prepare('SELECT id, author_role, body, created_at FROM dispute_messages WHERE dispute_id = ?').all(d.dispute_id)
        .map(item => ({ type: 'message', ...item })),
      ...db.prepare('SELECT id, author_role, original_filename, storage_path, created_at FROM dispute_evidence WHERE dispute_id = ?').all(d.dispute_id)
        .map(item => ({ type: 'evidence', ...item }))
    ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
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

// GET /api/admin/reports — general problem reports, three kinds in one
// queue (see migrations/027/028/029_reports*.sql): an order-scoped report
// (purchase_id set), a product-only report (product_id set, no order —
// one seller flagging another's listing), and a general report tied to
// neither (a bug, "I can't log in," feedback — possibly from a logged-out
// visitor, see routes/reports.js). Every join from purchase_id onward is
// LEFT rather than required, since a general report has none of that
// context to show — only reason/subject/reporter_email are guaranteed.
router.get('/reports', requireAdmin, (req, res) => {
  const reports = db.prepare(`
        SELECT rp.id AS report_id, rp.subject, rp.reason, rp.serious_claim, rp.status AS report_status, rp.reporter_role, rp.created_at AS reported_at,
           pu.id AS purchase_id, pu.amount_minor, pu.currency, pu.created_at AS purchased_at,
           p.id AS product_id, p.title AS product_title, p.slug AS product_slug, p.currency AS product_currency, c.id AS creator_id,
           (SELECT COUNT(*) FROM service_disputes rd JOIN purchases rp ON rp.id = rd.purchase_id WHERE rp.product_id = p.id AND rd.status = 'open') AS open_product_disputes,
           buyer.name AS buyer_name, buyer.email AS buyer_email,
           c.name AS seller_name, c.handle AS seller_handle, cu.email AS seller_email,
           COALESCE(rp.reporter_email, reporter.email) AS reporter_email
    FROM reports rp
    LEFT JOIN purchases pu ON pu.id = rp.purchase_id
    LEFT JOIN products p ON p.id = COALESCE(rp.product_id, pu.product_id)
    LEFT JOIN buyers buyer ON buyer.id = pu.buyer_id
    LEFT JOIN creators c ON c.id = p.creator_id
    LEFT JOIN users cu ON cu.id = c.user_id
    LEFT JOIN users reporter ON reporter.id = rp.reporter_user_id
    WHERE rp.status = 'open'
    ORDER BY rp.created_at ASC
  `).all();

  const creatorBalances = new Map();
  res.json(reports.map(report => {
    if (!report.serious_claim || !report.product_id || !report.creator_id) {
      return { ...report, held_funds_minor: 0 };
    }
    if (!creatorBalances.has(report.creator_id)) {
      creatorBalances.set(report.creator_id, balancesFor(report.creator_id));
    }
    const hold = creatorBalances.get(report.creator_id).balances_by_currency[report.product_currency]?.product_holds
      .find(item => item.product_id === report.product_id);
    return { ...report, held_funds_minor: hold?.amount_minor || 0 };
  }));
});

// POST /api/admin/reports/:id/resolve — { note }. Resolving a serious
// product report also releases its product-specific reserve because the
// wallet only holds proceeds while that report remains open.
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

  const creators = db.prepare('SELECT id, name, handle, email, payout_ecocash_number, payout_changed_at FROM creators').all();
  const RECENT_CHANGE_HOURS = 72;
  const creatorBalances = creators.map(c => ({
    ...c, ...balancesFor(c.id),
    payout_number_recently_changed: !!c.payout_changed_at &&
      Date.now() - new Date(c.payout_changed_at.replace(' ', 'T') + 'Z').getTime() < RECENT_CHANGE_HOURS * 3600e3
  }));
  const owed = creatorBalances.flatMap(creator => Object.values(creator.balances_by_currency)
    .map(balance => ({ ...creator, ...balance })))
    .filter(c => c.available_minor > 0)
    .sort((a, b) => b.available_minor - a.available_minor);
  const totalsByCurrency = (key) => creatorBalances.reduce((totals, creator) => {
    for (const [currency, balance] of Object.entries(creator.balances_by_currency)) {
      totals[currency] = (totals[currency] || 0) + balance[key];
    }
    return totals;
  }, {});
  const totalDueByCurrency = {};
  for (const creator of owed) totalDueByCurrency[creator.currency] = (totalDueByCurrency[creator.currency] || 0) + creator.available_minor;

  res.json({
    total_due_by_currency: totalDueByCurrency,
    total_due_minor: totalDueByCurrency.USD || 0,
    total_order_escrow_by_currency: totalsByCurrency('escrowed_minor'),
    total_product_hold_by_currency: totalsByCurrency('product_hold_minor'),
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
  const currency = req.body?.currency || 'USD';
  if (!['USD', 'ZWG'].includes(currency)) return res.status(400).json({ error: 'currency must be USD or ZWG.' });
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    return res.status(400).json({ error: 'amount_minor must be a positive integer.' });
  }

  try {
    db.transaction(() => {
      const availableMinor = balancesFor(creator.id).balances_by_currency[currency]?.available_minor || 0;
      if (amountMinor > availableMinor) {
        throw new Error(`That's more than this creator's ${currency} available balance (${availableMinor} minor units).`);
      }

      const paidRows = db.prepare(`
        SELECT pu.id, pu.amount_minor, pu.currency, pu.created_at, pu.fulfillment_status,
               p.id AS product_id
        FROM purchases pu JOIN products p ON p.id = pu.product_id
        WHERE p.creator_id = ? AND pu.payment_status = 'paid'
      `).all(creator.id);
      const remainingByPurchase = remainingNetByPurchaseFor(creator.id, paidRows);
      const eligible = db.prepare(`
        SELECT pu.id, pu.amount_minor, pu.currency, pu.created_at, pu.fulfillment_status,
               p.id AS product_id
        FROM purchases pu JOIN products p ON p.id = pu.product_id
        WHERE p.creator_id = ? AND pu.payment_status = 'paid' AND pu.currency = ?
          AND (pu.fulfillment_status IS NULL OR pu.fulfillment_status = 'released')
          AND NOT EXISTS (
            SELECT 1 FROM reports r WHERE r.product_id = p.id AND r.status = 'open' AND r.serious_claim = 1
          )
          AND NOT EXISTS (
            SELECT 1 FROM service_disputes d JOIN purchases dp ON dp.id = d.purchase_id
            WHERE dp.product_id = p.id AND d.status = 'open' AND d.serious_claim = 1
          )
        ORDER BY pu.created_at, pu.id
      `).all(creator.id, currency);

      let remainingToAllocate = amountMinor;
      const allocations = [];
      for (const purchase of eligible) {
        const amount = Math.min(remainingByPurchase.get(purchase.id) || 0, remainingToAllocate);
        if (amount > 0) allocations.push({ purchase_id: purchase.id, amount_minor: amount });
        remainingToAllocate -= amount;
        if (!remainingToAllocate) break;
      }
      if (remainingToAllocate > 0) throw new Error('Could not allocate this payout to eligible product sales. Refresh the payout list and try again.');

      const result = db.prepare('INSERT INTO payouts (creator_id, amount_minor, note, currency) VALUES (?, ?, ?, ?)')
        .run(creator.id, amountMinor, (req.body?.note || '').trim() || null, currency);
      const insertAllocation = db.prepare('INSERT INTO payout_allocations (payout_id, purchase_id, amount_minor) VALUES (?, ?, ?)');
      for (const allocation of allocations) insertAllocation.run(result.lastInsertRowid, allocation.purchase_id, allocation.amount_minor);
    })();
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  res.status(201).json({ ok: true, ...balancesFor(creator.id) });
});

// GET /api/admin/payouts/history — a running log across every creator, most
// recent first, for "did we actually pay X last week" questions.
router.get('/payouts/history', requireAdmin, (req, res) => {
  const history = db.prepare(`
    SELECT po.id, po.amount_minor, po.currency, po.note, po.paid_at, c.id AS creator_id, c.name AS creator_name, c.handle AS creator_handle
    FROM payouts po JOIN creators c ON c.id = po.creator_id
    ORDER BY po.paid_at DESC
    LIMIT 100
  `).all();
  res.json(history);
});

// POST /api/admin/subscriptions/sweep — the one scheduled job this app
// has. No in-process scheduler exists (see escrow.js's sweepAutoReleases
// comment) — this is meant to be triggered externally, once a day, by a
// GitHub Actions workflow (.github/workflows/subscription-sweep.yml)
// hitting this route with the same ADMIN_KEY every other admin route
// already uses. Emails only ever go out from here, never from a page
// load, see subscriptions.js's own reasoning for that split.
router.post('/subscriptions/sweep', requireAdmin, (req, res) => {
  const result = sendRenewalReminders();
  res.json({ ok: true, ...result });
});

// Exported so routes/blog.js can gate its own admin routes with the exact
// same timing-safe ADMIN_KEY check, rather than a second copy of
// security-sensitive comparison logic.

// POST /api/admin/disputes/:id/resolve — manual dispute resolution.
// Admin reviews the case chat and evidence, then picks 'refund' (buyer wins,
// money goes back) or 'release' (seller wins, money releases to wallet).
router.post('/disputes/:id/resolve', requireAdmin, (req, res) => {
  const { resolution, note } = req.body;
  if (!['refund', 'release'].includes(resolution)) {
    return res.status(400).json({ error: 'Resolution must be refund or release.' });
  }
  
  const dispute = db.prepare('SELECT * FROM service_disputes WHERE id = ?').get(req.params.id);
  if (!dispute) return res.status(404).json({ error: 'Dispute not found.' });
  
  if (dispute.status !== 'open') {
    return res.status(400).json({ error: 'Dispute is already resolved.' });
  }
  
  resolveDispute(dispute.id, resolution, note);
  res.json({ ok: true });
});

module.exports = router;
module.exports.requireAdmin = requireAdmin;
