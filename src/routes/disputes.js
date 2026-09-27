const express = require('express');
const multer = require('multer');
const db = require('../db/schema');
const storage = require('../lib/storage');
const { requireAuth } = require('../middleware/auth');
const { disputeFor } = require('../lib/escrow');
const { hasOffPlatformContact } = require('../lib/disputeMessagePolicy');

const router = express.Router();
const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

function authorizedCase(req, res) {
  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(req.params.purchaseId);
  if (!purchase) {
    res.status(404).json({ error: 'Order not found.' });
    return null;
  }

  const buyer = db.prepare('SELECT user_id FROM buyers WHERE id = ?').get(purchase.buyer_id);
  const seller = db.prepare(`
    SELECT c.user_id
    FROM products p JOIN creators c ON c.id = p.creator_id
    WHERE p.id = ?
  `).get(purchase.product_id);
  const role = buyer?.user_id === req.user.id ? 'buyer' : seller?.user_id === req.user.id ? 'seller' : null;
  if (!role) {
    res.status(403).json({ error: 'Not authorized for this dispute.' });
    return null;
  }

  const dispute = disputeFor(purchase.id);
  if (!dispute) {
    res.status(404).json({ error: 'Dispute not found.' });
    return null;
  }
  return { dispute, role };
}

router.get('/purchases/:purchaseId', requireAuth, (req, res) => {
  const auth = authorizedCase(req, res);
  if (!auth) return;
  const messages = db.prepare('SELECT * FROM dispute_messages WHERE dispute_id = ? ORDER BY id ASC').all(auth.dispute.id);
  const evidence = db.prepare('SELECT * FROM dispute_evidence WHERE dispute_id = ? ORDER BY id ASC').all(auth.dispute.id)
    .map(item => ({ ...item, storage_path: storage.publicUrl(item.storage_path) }));
  const timeline = [
    ...messages.map(item => ({
      type: 'message',
      ...item,
      body: hasOffPlatformContact(item.body)
        ? 'This message is hidden because it contains off-platform contact details.'
        : item.body
    })),
    ...evidence.map(item => ({ type: 'evidence', ...item }))
  ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  res.json({
    timeline,
    status: auth.dispute.status,
    serious_claim: !!auth.dispute.serious_claim,
    reason: hasOffPlatformContact(auth.dispute.reason)
      ? 'This reason is hidden because it contains off-platform contact details.'
      : auth.dispute.reason
  });
});

router.post('/purchases/:purchaseId/serious-claim', requireAuth, (req, res) => {
  const auth = authorizedCase(req, res);
  if (!auth) return;
  if (auth.dispute.status !== 'open') return res.status(409).json({ error: 'This dispute is closed.' });
  if (auth.dispute.serious_claim) return res.status(409).json({ error: 'This case is already marked as a serious product claim.' });

  const body = (req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Describe why you believe the product is stolen, illegal, counterfeit, or fundamentally fake or misleading.' });
  if (body.length > 2000) return res.status(400).json({ error: 'Keep the message under 2000 characters.' });
  if (hasOffPlatformContact(body)) {
    return res.status(400).json({ error: 'Keep dispute details on SCORPIO. Phone numbers, email addresses, and external links are not allowed.' });
  }

  db.prepare('UPDATE service_disputes SET serious_claim = 1 WHERE id = ?').run(auth.dispute.id);
  db.prepare(`
    INSERT INTO dispute_messages (dispute_id, user_id, author_role, body)
    VALUES (?, ?, ?, ?)
  `).run(auth.dispute.id, req.user.id, auth.role, body);
  res.status(201).json({ ok: true, serious_claim: true });
});

router.post('/purchases/:purchaseId/messages', requireAuth, (req, res) => {
  const auth = authorizedCase(req, res);
  if (!auth) return;
  if (auth.dispute.status !== 'open') return res.status(409).json({ error: 'This dispute is closed.' });
  const body = (req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Message cannot be empty.' });
  if (hasOffPlatformContact(body)) {
    return res.status(400).json({ error: 'Keep dispute messages on SCORPIO. Phone numbers, email addresses, and external links are not allowed.' });
  }
  db.prepare(`
    INSERT INTO dispute_messages (dispute_id, user_id, author_role, body)
    VALUES (?, ?, ?, ?)
  `).run(auth.dispute.id, req.user.id, auth.role, body);
  res.status(201).json({ ok: true });
});

router.post('/purchases/:purchaseId/evidence', requireAuth, evidenceUpload.single('file'), async (req, res) => {
  const auth = authorizedCase(req, res);
  if (!auth) return;
  if (auth.dispute.status !== 'open') return res.status(409).json({ error: 'This dispute is closed.' });
  if (!req.file) return res.status(400).json({ error: 'Choose a screenshot or file first.' });
  if (hasOffPlatformContact(req.file.originalname)) {
    return res.status(400).json({ error: 'Remove phone numbers, email addresses, and links from the evidence filename.' });
  }
  if (!storage.isConfigured()) return res.status(503).json({ error: 'File storage is not configured yet.' });

  try {
    const key = `evidence/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '')}`;
    await storage.uploadBuffer(key, req.file.buffer, req.file.mimetype);
    db.prepare(`
      INSERT INTO dispute_evidence
        (dispute_id, user_id, author_role, storage_path, original_filename, mime)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(auth.dispute.id, req.user.id, auth.role, key, req.file.originalname, req.file.mimetype);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[dispute evidence]', err);
    res.status(502).json({ error: 'Failed to upload evidence.' });
  }
});

module.exports = router;
