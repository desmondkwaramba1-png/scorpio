const express = require('express');
const db = require('../db/schema');
const storage = require('../lib/storage');

const router = express.Router();

// GET /api/downloads/:token — no login required by design: this is the
// link that goes out by email/WhatsApp and has to work for a buyer on a
// different device who never logs into the site. The token itself, its
// expiry, and its download-count cap are the access control — the actual
// bytes live in R2 as a private object, only ever reachable through a
// presigned URL minted here, after all of that has been checked. Redirecting
// to it (rather than this server streaming the file itself) means R2/
// Cloudflare's edge serves the actual bytes, not this Fly machine.
router.get('/:token', async (req, res) => {
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

  try {
    const filename = file.original_filename || 'download';
    const url = await storage.getPresignedUrl(file.storage_path, {
      contentDisposition: `attachment; filename="${filename.replace(/"/g, '')}"`
    });
    res.redirect(url);
  } catch (err) {
    console.error('[downloads]', err.message);
    res.status(404).send('That file could not be found.');
  }
});

// GET /api/downloads/:token/view — inline streaming for in-app viewing
// (video playback, PDFs opened in a tab) instead of forcing a save-to-disk
// prompt. Doesn't count against the token's download limit — rewatching a
// video you already bought shouldn't burn through it — but still checks
// expiry, so an expired link can't be watched either.
router.get('/:token/view', async (req, res) => {
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

  try {
    // No content-disposition override — R2 serves it inline, and honors
    // Range requests on the redirected URL exactly like sendFile() did
    // from local disk, so a <video> element can still seek.
    const url = await storage.getPresignedUrl(file.storage_path);
    res.redirect(url);
  } catch (err) {
    console.error('[downloads]', err.message);
    res.status(404).send('That file could not be found.');
  }
});

module.exports = router;
