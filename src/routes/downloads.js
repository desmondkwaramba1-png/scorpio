const express = require('express');
const db = require('../db/schema');
const storage = require('../lib/storage');
const { requireAuth } = require('../middleware/auth');

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
  if (row.max_downloads !== null && row.max_downloads !== undefined && row.download_count >= row.max_downloads) {
    return res.status(429).send('This download link has reached its download limit. Ask the creator to resend it.');
  }

  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(row.purchase_id);
  if (!purchase || purchase.payment_status !== 'paid') {
    return res.status(403).send('This purchase is not paid.');
  }
  if (purchase.fulfillment_status === 'refunded') {
    return res.status(403).send('This order was refunded, so the download is no longer available.');
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

// Streams a stored document through the API (instead of redirecting to the
// file store) so the in-app reader can load it same-origin, a page at a time,
// using HTTP Range requests. Same access rules as /view are enforced by the
// callers before this runs.
async function streamDocument(req, res, key, filename) {
  const range = typeof req.headers.range === 'string' && /^bytes=\d*-\d*$/.test(req.headers.range) ? req.headers.range : undefined;
  try {
    const object = await storage.getObjectStream(key, { range });
    const isPdf = /\.pdf$/i.test(filename || '') || object.contentType === 'application/pdf';
    const safeName = encodeURIComponent((filename || 'document').replace(/[\r\n"]/g, ''));
    res.status(object.contentRange ? 206 : 200);
    res.set({
      'Content-Type': isPdf ? 'application/pdf' : 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${safeName}`,
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store'
    });
    if (object.contentRange) res.set('Content-Range', object.contentRange);
    if (Number.isFinite(object.size)) res.set('Content-Length', String(object.size));
    object.stream.on('error', err => {
      console.error('[downloads stream]', err.message);
      res.destroy(err);
    });
    object.stream.pipe(res);
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 416 || err?.name === 'InvalidRange') return res.status(416).send('Range not satisfiable.');
    console.error('[downloads stream]', err.message);
    if (!res.headersSent) res.status(404).send('That file could not be found.');
  }
}

// GET /api/downloads/:token/stream: the in-app reader's source.
router.get('/:token/stream', async (req, res) => {
  const row = db.prepare('SELECT * FROM download_tokens WHERE token = ?').get(req.params.token);
  if (!row) return res.status(404).send('This link is invalid.');
  if (new Date(row.expires_at) < new Date()) return res.status(410).send('This link has expired.');

  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(row.purchase_id);
  if (!purchase || purchase.payment_status !== 'paid') return res.status(403).send('This purchase is not paid.');
  if (purchase.fulfillment_status === 'refunded') return res.status(403).send('This order was refunded, so the document is no longer available.');

  const file = db.prepare('SELECT * FROM product_files WHERE product_id = ? LIMIT 1').get(purchase.product_id);
  if (!file || file.kind === 'external_link') return res.status(404).send('No document is attached to this product.');
  return streamDocument(req, res, file.storage_path, file.original_filename);
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
  if (purchase.fulfillment_status === 'refunded') {
    return res.status(403).send('This order was refunded, so the download is no longer available.');
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

// GET /api/downloads/issue/:issueId — a serial issue's file, not a product
// file. Different access-control shape on purpose: issues aren't emailed
// out one at a time with their own token (a serial keeps adding them, so
// there's no single moment to mail a link), so this checks the live
// session instead — logged in, and holding a paid purchase of the issue's
// product. Whoever bought the product gets every issue under it, past and
// future, which is exactly what this query allows for free (no per-issue
// purchase row to create or check).
router.get('/issue/:issueId', requireAuth, async (req, res) => {
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.issueId);
  if (!issue) return res.status(404).send('This issue could not be found.');

  const owns = db.prepare(`
    SELECT 1 FROM purchases pu JOIN buyers b ON b.id = pu.buyer_id
    WHERE b.user_id = ? AND pu.product_id = ? AND pu.payment_status = 'paid'
      AND COALESCE(pu.fulfillment_status, '') != 'refunded'
  `).get(req.user.id, issue.product_id);
  if (!owns) return res.status(403).send("You don't have access to this issue.");

  if (issue.kind === 'external_link') {
    return res.redirect(issue.external_url);
  }
  if (!issue.file_path) return res.status(404).send('No file is attached to this issue.');

  try {
    const filename = issue.original_filename || 'download';
    const url = await storage.getPresignedUrl(issue.file_path, {
      contentDisposition: `attachment; filename="${filename.replace(/"/g, '')}"`
    });
    res.redirect(url);
  } catch (err) {
    console.error('[downloads]', err.message);
    res.status(404).send('That file could not be found.');
  }
});

// GET /api/downloads/issue/:issueId/stream: reader source for a serial issue.
router.get('/issue/:issueId/stream', requireAuth, async (req, res) => {
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.issueId);
  if (!issue) return res.status(404).send('This issue could not be found.');

  const owns = db.prepare(`
    SELECT 1 FROM purchases pu JOIN buyers b ON b.id = pu.buyer_id
    WHERE b.user_id = ? AND pu.product_id = ? AND pu.payment_status = 'paid'
      AND COALESCE(pu.fulfillment_status, '') != 'refunded'
  `).get(req.user.id, issue.product_id);
  if (!owns) return res.status(403).send("You don't have access to this issue.");
  if (issue.kind === 'external_link' || !issue.file_path) return res.status(404).send('No document is attached to this issue.');
  return streamDocument(req, res, issue.file_path, issue.original_filename);
});

// GET /api/downloads/issue/:issueId/view — inline streaming for a serial
// issue (video playback, a PDF rendered in the browser instead of
// downloaded), same ownership check as the plain download route above,
// same "no attachment content-disposition" trick /:token/view already
// uses so R2 serves it inline and a <video> element can still seek via
// Range requests on the redirected URL.
router.get('/issue/:issueId/view', requireAuth, async (req, res) => {
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.issueId);
  if (!issue) return res.status(404).send('This issue could not be found.');

  const owns = db.prepare(`
    SELECT 1 FROM purchases pu JOIN buyers b ON b.id = pu.buyer_id
    WHERE b.user_id = ? AND pu.product_id = ? AND pu.payment_status = 'paid'
      AND COALESCE(pu.fulfillment_status, '') != 'refunded'
  `).get(req.user.id, issue.product_id);
  if (!owns) return res.status(403).send("You don't have access to this issue.");

  if (issue.kind === 'external_link') {
    return res.redirect(issue.external_url);
  }
  if (!issue.file_path) return res.status(404).send('No file is attached to this issue.');

  try {
    const url = await storage.getPresignedUrl(issue.file_path);
    res.redirect(url);
  } catch (err) {
    console.error('[downloads]', err.message);
    res.status(404).send('That file could not be found.');
  }
});

module.exports = router;
