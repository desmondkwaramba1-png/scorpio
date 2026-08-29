const express = require('express');
const path = require('path');
const db = require('../db/schema');
const { UPLOADS_DIR } = require('../lib/paths');

const router = express.Router();

// GET /api/downloads/:token — no login required by design: this is the
// link that goes out by email/WhatsApp and has to work for a buyer on a
// different device who never logs into the site. The token itself, its
// expiry, and its download-count cap are the access control.
router.get('/:token', (req, res) => {
  const row = db.prepare('SELECT * FROM download_tokens WHERE token = ?').get(req.params.token);
  if (!row) return res.status(404).send('This download link is invalid.');
  if (new Date(row.expires_at) < new Date()) return res.status(410).send('This download link has expired.');
  if (row.download_count >= row.max_downloads) {
    return res.status(429).send('This download link has reached its download limit. Ask the creator to resend it.');
  }

  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(row.purchase_id);
  if (!purchase || purchase.payment_status !== 'paid') {
    return res.status(403).send('This purchase is not paid.');
  }

  const file = db.prepare('SELECT * FROM product_files WHERE product_id = ? LIMIT 1').get(purchase.product_id);
  if (!file) return res.status(404).send('No file is attached to this product yet.');

  db.prepare('UPDATE download_tokens SET download_count = download_count + 1 WHERE id = ?').run(row.id);

  if (file.kind === 'external_link') {
    return res.redirect(file.external_url);
  }

  const filename = path.basename(file.storage_path);
  const filePath = path.join(UPLOADS_DIR, filename);
  res.download(filePath, file.original_filename || filename, err => {
    if (err && !res.headersSent) res.status(404).send('That file could not be found.');
  });
});

// GET /api/downloads/:token/view — inline streaming for in-app viewing
// (video playback, PDFs opened in a tab) instead of forcing a save-to-disk
// prompt. Doesn't count against the token's download limit — rewatching a
// video you already bought shouldn't burn through it — but still checks
// expiry, so an expired link can't be watched either.
router.get('/:token/view', (req, res) => {
  const row = db.prepare('SELECT * FROM download_tokens WHERE token = ?').get(req.params.token);
  if (!row) return res.status(404).send('This link is invalid.');
  if (new Date(row.expires_at) < new Date()) return res.status(410).send('This link has expired.');

  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(row.purchase_id);
  if (!purchase || purchase.payment_status !== 'paid') {
    return res.status(403).send('This purchase is not paid.');
  }

  const file = db.prepare('SELECT * FROM product_files WHERE product_id = ? LIMIT 1').get(purchase.product_id);
  if (!file) return res.status(404).send('No file is attached to this product yet.');

  if (file.kind === 'external_link') {
    return res.redirect(file.external_url);
  }

  const filename = path.basename(file.storage_path);
  const filePath = path.join(UPLOADS_DIR, filename);
  // sendFile (unlike download) doesn't force Content-Disposition: attachment,
  // and honors Range requests, which is what lets a <video> element seek.
  res.sendFile(filePath, err => {
    if (err && !res.headersSent) res.status(404).send('That file could not be found.');
  });
});

module.exports = router;
