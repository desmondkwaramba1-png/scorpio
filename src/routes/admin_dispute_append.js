// POST /api/admin/disputes/:id/resolve
const { resolveDispute } = require('../lib/escrow');

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
