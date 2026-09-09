// Buyer or seller reporting a problem with an ordinary order — see
// migrations/027_reports.sql for why this exists alongside the older
// service-order dispute system rather than folding into it.
const express = require('express');
const db = require('../db/schema');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/reports — { purchase_id, reason }. The reporter must actually
// be a party to the order (the buyer who paid, or the creator who sold
// it) — anyone else, 403. Which one they are becomes reporter_role,
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
  if (existing) return res.status(409).json({ error: 'This order already has an open report — no need to send another.' });

  const result = db.prepare(`
    INSERT INTO reports (purchase_id, reporter_user_id, reporter_role, reason)
    VALUES (?, ?, ?, ?)
  `).run(purchaseId, req.user.id, reporterRole, reason);

  res.status(201).json({ id: result.lastInsertRowid, status: 'open' });
});

module.exports = router;
