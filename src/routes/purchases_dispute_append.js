// Helper to get purchase and check authorization for dispute actions
function getAuthorizedDispute(req, res) {
  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(req.params.id);
  if (!purchase) return res.status(404).json({ error: 'Order not found.' });
  
  const buyer = db.prepare('SELECT user_id FROM buyers WHERE id = ?').get(purchase.buyer_id);
  const product = db.prepare('SELECT creator_id FROM products WHERE id = ?').get(purchase.product_id);
  const creator = db.prepare('SELECT user_id FROM creators WHERE id = ?').get(product.creator_id);
  
  let role = null;
  if (buyer && buyer.user_id === req.user.id) role = 'buyer';
  else if (creator && creator.user_id === req.user.id) role = 'seller';
  // Admin checking could go here if needed, but admin has its own routes usually
  
  if (!role) return res.status(403).json({ error: 'Not authorized for this dispute.' });
  
  const dispute = disputeFor(purchase.id);
  if (!dispute) return res.status(404).json({ error: 'Dispute not found.' });
  
  return { purchase, dispute, role };
}

// GET /api/purchases/:id/dispute/messages
router.get('/:id/dispute/messages', requireAuth, (req, res) => {
  const auth = getAuthorizedDispute(req, res);
  if (auth.error) return; // already sent response
  const { dispute } = auth;
  
  const messages = db.prepare('SELECT * FROM dispute_messages WHERE dispute_id = ? ORDER BY created_at ASC').all(dispute.id);
  const evidence = db.prepare('SELECT * FROM dispute_evidence WHERE dispute_id = ? ORDER BY created_at ASC').all(dispute.id);
  
  // Mix them into a single timeline
  const timeline = [
    ...messages.map(m => ({ type: 'message', ...m })),
    ...evidence.map(e => ({ type: 'evidence', ...e, storage_path: storage.publicUrl(e.storage_path) }))
  ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  
  res.json({ timeline, status: dispute.status });
});

// POST /api/purchases/:id/dispute/messages
router.post('/:id/dispute/messages', requireAuth, (req, res) => {
  const auth = getAuthorizedDispute(req, res);
  if (auth.error) return;
  const { dispute, role } = auth;
  
  if (dispute.status !== 'open') {
    return res.status(400).json({ error: 'This dispute is closed.' });
  }
  
  const body = (req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Message cannot be empty.' });
  
  db.prepare('INSERT INTO dispute_messages (dispute_id, user_id, author_role, body) VALUES (?, ?, ?, ?)')
    .run(dispute.id, req.user.id, role, body);
    
  res.status(201).json({ ok: true });
});

// POST /api/purchases/:id/dispute/evidence
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

router.post('/:id/dispute/evidence', requireAuth, upload.single('file'), async (req, res) => {
  const auth = getAuthorizedDispute(req, res);
  if (auth.error) return;
  const { dispute, role } = auth;
  
  if (dispute.status !== 'open') {
    return res.status(400).json({ error: 'This dispute is closed.' });
  }
  
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded.' });
  
  try {
    const fileKey = 'evidence/' + Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '');
    await storage.uploadBuffer(fileKey, file.buffer, file.mimetype);
    
    db.prepare('INSERT INTO dispute_evidence (dispute_id, user_id, author_role, storage_path, original_filename, mime) VALUES (?, ?, ?, ?, ?, ?)')
      .run(dispute.id, req.user.id, role, fileKey, file.originalname, file.mimetype);
      
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Failed to upload evidence.' });
  }
});
