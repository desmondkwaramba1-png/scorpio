// Integration regression tests for the money / upload / ownership fixes from
// the production-readiness audit. Real routers on an ephemeral port against
// an isolated SQLite file; R2 and the payment gateway are stubbed in-process,
// nothing external is contacted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { PassThrough } = require('node:stream');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'scorpio-integrity-'));
process.env.NODE_ENV = 'test';
process.env.ACCOUNT_SECURITY_RATE_LIMIT = '1000'; // every request here shares one loopback IP

// --- stubs, installed before any route module captures the real ones ------
const objects = new Map();   // key -> { body: Buffer, contentType }
const deleted = [];
const storage = require('../src/lib/storage');
storage.isConfigured = () => true;
storage.publicUrl = key => `https://cdn.test/${key}`;
storage.uploadStream = async (key, body, contentType) => {
  const chunks = [];
  for await (const chunk of body) chunks.push(chunk);
  objects.set(key, { body: Buffer.concat(chunks), contentType });
  return key;
};
storage.uploadBuffer = async (key, body, contentType) => {
  if (!Buffer.isBuffer(body)) throw new Error('uploadBuffer called without a Buffer body');
  objects.set(key, { body, contentType });
  return key;
};
storage.getObjectBuffer = async key => objects.get(key).body;
storage.deleteObject = async key => { deleted.push(key); objects.delete(key); };
storage.getObjectStream = async (key, { range } = {}) => {
  const { Readable } = require('node:stream');
  const whole = objects.get(key).body;
  let start = 0; let end = whole.length - 1;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    start = m[1] === '' ? Math.max(0, whole.length - Number(m[2])) : Number(m[1]);
    end = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), whole.length - 1) : end;
    if (start >= whole.length) { const e = new Error('InvalidRange'); e.$metadata = { httpStatusCode: 416 }; throw e; }
  }
  const slice = whole.subarray(start, end + 1);
  return { stream: Readable.from([slice]), size: slice.length, contentRange: range ? `bytes ${start}-${end}/${whole.length}` : null, contentType: null };
};
storage.keyFromReference = (ref) => {
  if (typeof ref !== 'string') return null;
  const key = ref.replace('https://cdn.test/', '');
  return /^(covers|product-files|previews|issue-files)\//.test(key) ? key : null;
};

const sentEmails = [];
require('../src/lib/notify').sendEmail = async (to, subject, body) => { sentEmails.push({ to, subject, body }); };

const payment = require('../src/services/payment');
payment.createOrder = async () => ({ success: true, ecocashStatus: 'PENDING SUBSCRIBER VALIDATION' });
let gatewayStatus = 'pending';
payment.checkOrderStatus = async () => ({ status: gatewayStatus });
payment.isConfigured = () => true;

const express = require('express');
const cookieParser = require('cookie-parser');
const sharp = require('sharp');
const db = require('../src/db/schema');
const { attachUser, COOKIE_NAME } = require('../src/middleware/auth');
const { markPurchasePaid } = require('../src/lib/purchaseCompletion');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(attachUser);
app.use('/api/products', require('../src/routes/products'));
app.use('/api/purchases', require('../src/routes/purchases'));
app.use('/api/cart', require('../src/routes/cart'));
app.use('/api/downloads', require('../src/routes/downloads'));
app.use('/api/auth', require('../src/routes/auth'));
app.use('/api/creators', require('../src/routes/creators'));
require('../src/lib/asyncErrors');
app.get('/__boom', async () => { throw new Error('async route failure'); });
app.use((err, req, res, _next) => res.status(400).json({ error: err.message }));

let n = 0;
const bcrypt = require('bcryptjs');
const PASSWORD = 'correct-horse-9';
function makeUser({ email, verified = true, creator = false, password = false }) {
  n += 1;
  const userId = db.prepare(
    "INSERT INTO users (phone, email, username, name, email_verified_at, terms_accepted_at, password_hash) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)"
  ).run(`07800000${String(n).padStart(2, '0')}`, email, `user${n}`, `User ${n}`, verified ? new Date().toISOString() : null,
    password ? bcrypt.hashSync(PASSWORD, 4) : null).lastInsertRowid;
  const sid = `sess-${n}`;
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sid, userId, new Date(Date.now() + 3600e3).toISOString());
  let creatorId = null;
  if (creator) {
    creatorId = db.prepare('INSERT INTO creators (name, email, handle, user_id) VALUES (?, ?, ?, ?)')
      .run(`Creator ${n}`, email, `creator${n}`, userId).lastInsertRowid;
  }
  const cookie = `${COOKIE_NAME}=${sid}`;
  emailByCookie.set(cookie, email);
  return { userId, creatorId, cookie };
}

function addProduct(creatorId, fields = {}) {
  const row = {
    title: 'Test product', type: 'single', price_minor: 500, currency: 'USD', status: 'published',
    category: 'ebooks', quantity_limit: null, cover_path: 'https://cdn.test/covers/seed.png', ...fields
  };
  const slug = `p-${Math.random().toString(36).slice(2, 8)}`;
  const id = db.prepare(`
    INSERT INTO products (creator_id, title, type, price_minor, currency, status, category, quantity_limit, cover_path, slug)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(creatorId, row.title, row.type, row.price_minor, row.currency, row.status, row.category, row.quantity_limit, row.cover_path, slug).lastInsertRowid;
  db.prepare("INSERT INTO product_files (product_id, kind, external_url) VALUES (?, 'external_link', 'https://example.com/x')").run(id);
  return { id, slug };
}

let base;
const emailByCookie = new Map();
async function call(method, url, { cookie, json, form } = {}) {
  const headers = {};
  // The real client sends the account's own email in the checkout body.
  if (json && /^\/api\/purchases$/.test(url) && !json.email && emailByCookie.has(cookie)) json.email = emailByCookie.get(cookie);
  if (cookie) headers.Cookie = cookie;
  let body;
  if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(base + url, { method, headers, body });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data };
}

async function pngBuffer() {
  return sharp({ create: { width: 40, height: 40, channels: 3, background: '#2a7' } }).png().toBuffer();
}
function productForm(extra = {}, cover) {
  const form = new FormData();
  form.set('title', 'Uploaded product');
  form.set('type', 'single');
  form.set('category', 'ebooks');
  form.set('price', '3.00');
  form.set('external_url', 'https://example.com/book');
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  if (cover) form.set('cover', new Blob([cover.bytes], { type: cover.type }), cover.name || 'cover.png');
  return form;
}

const results = [];
async function check(name, fn) {
  try { await fn(); results.push([name, true]); console.log(`  ok   ${name}`); }
  catch (err) { results.push([name, false, err]); console.log(`  FAIL ${name}\n       ${err.message}`); }
}

async function main() {
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;

  const seller = makeUser({ email: 'seller@example.invalid', creator: true });
  const otherSeller = makeUser({ email: 'seller2@example.invalid', creator: true });
  const buyerA = makeUser({ email: 'a@example.invalid' });
  const buyerB = makeUser({ email: 'b@example.invalid' });
  const unverified = makeUser({ email: 'u@example.invalid', verified: false });
  const attacker = makeUser({ email: 'attacker@example.invalid' });

  // ---- payment completion ------------------------------------------------
  await check('markPurchasePaid is idempotent (stock and fee recorded once)', async () => {
    const { id } = addProduct(seller.creatorId, { quantity_limit: 5 });
    const buyerId = db.prepare('INSERT INTO buyers (name, email, user_id) VALUES (?, ?, ?)').run('x', 'idem@example.invalid', buyerA.userId).lastInsertRowid;
    const pid = db.prepare("INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_status) VALUES (?, ?, 1000, 'USD', 'pending')").run(buyerId, id).lastInsertRowid;
    markPurchasePaid(pid); markPurchasePaid(pid); markPurchasePaid(pid);
    assert.equal(db.prepare('SELECT quantity_sold FROM products WHERE id = ?').get(id).quantity_sold, 1);
    const p = db.prepare('SELECT * FROM purchases WHERE id = ?').get(pid);
    assert.equal(p.fee_minor + p.net_minor, 1000);
  });

  // ---- checkout auth + ownership ----------------------------------------
  await check('checkout requires login and a verified email', async () => {
    const { slug } = addProduct(seller.creatorId);
    assert.equal((await call('POST', '/api/purchases', { json: { product_slug: slug, phone: '0780070488' } })).status, 401);
    assert.equal((await call('POST', '/api/purchases', { cookie: unverified.cookie, json: { product_slug: slug, phone: '0780070488' } })).status, 403);
  });

  await check('checkout ignores a body email: cannot claim another person\'s guest buyer record', async () => {
    const { id, slug } = addProduct(seller.creatorId, { title: 'Victim bought this' });
    const victimBuyer = db.prepare('INSERT INTO buyers (name, email) VALUES (?, ?)').run('Victim', 'victim@example.invalid').lastInsertRowid;
    const victimPurchase = db.prepare("INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_status) VALUES (?, ?, 500, 'USD', 'paid')").run(victimBuyer, id).lastInsertRowid;
    const other = addProduct(seller.creatorId);
    const res = await call('POST', '/api/purchases', {
      cookie: attacker.cookie,
      json: { product_slug: other.slug, phone: '0780070488', email: 'victim@example.invalid' }
    });
    assert.equal(res.status, 201);
    assert.equal(db.prepare('SELECT user_id FROM buyers WHERE id = ?').get(victimBuyer).user_id, null);
    const mine = await call('GET', '/api/purchases/mine', { cookie: attacker.cookie });
    assert.ok(!mine.data.some(p => p.id === victimPurchase), 'victim purchase leaked into attacker library');
    assert.equal(db.prepare('SELECT buyer_id FROM purchases WHERE payment_reference = ?').get(res.data.order_id).buyer_id,
      db.prepare('SELECT id FROM buyers WHERE user_id = ?').get(attacker.userId).id);
    void slug;
  });

  await check('a pending checkout reserves the last unit (no oversell), own retry still allowed', async () => {
    const { slug, id } = addProduct(seller.creatorId, { quantity_limit: 1 });
    const first = await call('POST', '/api/purchases', { cookie: buyerA.cookie, json: { product_slug: slug, phone: '0780070488' } });
    assert.equal(first.status, 201);
    const second = await call('POST', '/api/purchases', { cookie: buyerB.cookie, json: { product_slug: slug, phone: '0780070488' } });
    assert.equal(second.status, 409);
    const retry = await call('POST', '/api/purchases', { cookie: buyerA.cookie, json: { product_slug: slug, phone: '0780070488' } });
    assert.equal(retry.status, 201);
    assert.equal(db.prepare('SELECT quantity_sold FROM products WHERE id = ?').get(id).quantity_sold, 0);
  });

  await check('unpaid reservation expires so an abandoned checkout cannot lock stock forever', async () => {
    const { slug, id } = addProduct(seller.creatorId, { quantity_limit: 1 });
    const buyerRow = db.prepare('SELECT id FROM buyers WHERE user_id = ?').get(buyerA.userId);
    db.prepare("INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_status, created_at) VALUES (?, ?, 500, 'USD', 'pending', datetime('now','-30 minutes'))").run(buyerRow.id, id);
    const res = await call('POST', '/api/purchases', { cookie: buyerB.cookie, json: { product_slug: slug, phone: '0780070488' } });
    assert.equal(res.status, 201);
  });

  await check('license keys: pending buyers cannot exceed unclaimed keys', async () => {
    const { slug, id } = addProduct(seller.creatorId);
    db.prepare('INSERT INTO license_keys (product_id, key_value) VALUES (?, ?)').run(id, 'KEY-ONLY-ONE');
    assert.equal((await call('POST', '/api/purchases', { cookie: buyerA.cookie, json: { product_slug: slug, phone: '0780070488' } })).status, 201);
    assert.equal((await call('POST', '/api/purchases', { cookie: buyerB.cookie, json: { product_slug: slug, phone: '0780070488' } })).status, 409);
  });

  await check('cannot buy your own product', async () => {
    const { slug } = addProduct(seller.creatorId);
    assert.equal((await call('POST', '/api/purchases', { cookie: seller.cookie, json: { product_slug: slug, phone: '0780070488' } })).status, 403);
  });

  // ---- uploads -----------------------------------------------------------
  const png = await pngBuffer();

  await check('valid cover uploads, is stored with the detected content type', async () => {
    const res = await call('POST', '/api/products', { cookie: seller.cookie, form: productForm({}, { bytes: png, type: 'image/png' }) });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    const key = res.data.cover_path.replace('https://cdn.test/', '');
    assert.equal(objects.get(key).contentType, 'image/png');
  });

  await check('corrupt "image" is rejected with a clear 400 and leaves no orphaned object', async () => {
    const before = new Set(objects.keys());
    const res = await call('POST', '/api/products', {
      cookie: seller.cookie,
      form: productForm({ title: 'Bad cover' }, { bytes: Buffer.from('<html><script>alert(1)</script></html>'), type: 'image/png' })
    });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /valid JPEG, PNG, WebP, or GIF/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM products WHERE title = 'Bad cover'").get().n, 0);
    await new Promise(r => setTimeout(r, 50));
    assert.deepEqual([...objects.keys()].filter(k => !before.has(k)), []);
  });

  await check('missing cover is rejected', async () => {
    assert.equal((await call('POST', '/api/products', { cookie: seller.cookie, form: productForm() })).status, 400);
  });

  await check('javascript: / data: deliverable links are rejected on create and edit', async () => {
    for (const bad of ['javascript:alert(document.cookie)', 'data:text/html,<script>1</script>', 'ftp://x.example/file']) {
      const res = await call('POST', '/api/products', {
        cookie: seller.cookie,
        form: productForm({ external_url: bad, title: 'Link attack' }, { bytes: png, type: 'image/png' })
      });
      assert.equal(res.status, 400, bad);
    }
    const { id } = addProduct(seller.creatorId);
    const form = new FormData(); form.set('external_url', 'javascript:alert(1)');
    assert.equal((await call('PATCH', `/api/products/${id}`, { cookie: seller.cookie, form })).status, 400);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM products WHERE title = 'Link attack'").get().n, 0);
  });

  await check('editing with a new cover removes the old object; omitting a cover keeps it', async () => {
    const created = await call('POST', '/api/products', { cookie: seller.cookie, form: productForm({ title: 'Edit me' }, { bytes: png, type: 'image/png' }) });
    const oldKey = created.data.cover_path.replace('https://cdn.test/', '');
    const keepForm = new FormData(); keepForm.set('title', 'Edit me 2');
    const kept = await call('PATCH', `/api/products/${created.data.id}`, { cookie: seller.cookie, form: keepForm });
    assert.equal(kept.status, 200);
    assert.equal(kept.data.cover_path, created.data.cover_path);
    assert.ok(objects.has(oldKey));
    const replaceForm = new FormData();
    replaceForm.set('cover', new Blob([png], { type: 'image/png' }), 'new.png');
    const replaced = await call('PATCH', `/api/products/${created.data.id}`, { cookie: seller.cookie, form: replaceForm });
    assert.equal(replaced.status, 200);
    assert.notEqual(replaced.data.cover_path, created.data.cover_path);
    await new Promise(r => setTimeout(r, 50));
    assert.ok(!objects.has(oldKey), 'old cover should be deleted');
    assert.ok(objects.has(replaced.data.cover_path.replace('https://cdn.test/', '')));
  });

  await check('another seller cannot edit or delete a product', async () => {
    const { id } = addProduct(seller.creatorId);
    const form = new FormData(); form.set('title', 'hijack');
    assert.equal((await call('PATCH', `/api/products/${id}`, { cookie: otherSeller.cookie, form })).status, 403);
    assert.equal((await call('DELETE', `/api/products/${id}`, { cookie: otherSeller.cookie })).status, 403);
    assert.equal((await call('DELETE', `/api/products/${id}`, { cookie: buyerA.cookie })).status, 403);
  });

  await check('deleting an unsold product removes its stored files; a sold one is refused', async () => {
    const created = await call('POST', '/api/products', { cookie: seller.cookie, form: productForm({ title: 'Delete me' }, { bytes: png, type: 'image/png' }) });
    const key = created.data.cover_path.replace('https://cdn.test/', '');
    assert.equal((await call('DELETE', `/api/products/${created.data.id}`, { cookie: seller.cookie })).status, 200);
    await new Promise(r => setTimeout(r, 50));
    assert.ok(!objects.has(key));

    const sold = addProduct(seller.creatorId);
    const b = db.prepare('SELECT id FROM buyers WHERE user_id = ?').get(buyerA.userId);
    db.prepare("INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_status) VALUES (?, ?, 500, 'USD', 'paid')").run(b.id, sold.id);
    assert.equal((await call('DELETE', `/api/products/${sold.id}`, { cookie: seller.cookie })).status, 409);
  });

  await check('serial issue file upload succeeds (previously crashed on undefined file.buffer)', async () => {
    const serial = addProduct(seller.creatorId, { type: 'serial', title: 'Serial' });
    const form = new FormData();
    form.set('title', 'Issue 1');
    form.set('file', new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }), 'issue1.pdf');
    const res = await call('POST', `/api/products/${serial.id}/issues`, { cookie: seller.cookie, form });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    const issue = db.prepare('SELECT * FROM issues WHERE product_id = ?').get(serial.id);
    assert.ok(objects.has(issue.file_path), 'issue file should exist in storage under the stored key');
    assert.equal(objects.get(issue.file_path).body.toString(), '%PDF-1.4 test', 'stored bytes must be the uploaded file');
  });

  await check('a rejecting async route returns an error response instead of hanging or killing the process', async () => {
    const res = await call('GET', '/__boom');
    assert.equal(res.status, 400);
    assert.match(res.data.error, /async route failure/);
    assert.equal((await call('GET', '/api/auth/me')).status, 200, 'server still alive');
  });

  await check('housekeeping purges expired sessions and codes but keeps live ones', async () => {
    const { purgeExpired } = require('../src/lib/housekeeping');
    const hk = makeUser({ email: 'hk@example.invalid' });
    db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES ('expired-hk', ?, '2020-01-01T00:00:00.000Z')").run(hk.userId);
    db.prepare("INSERT INTO payout_change_codes (user_id, code_hash, expires_at) VALUES (?, 'x', '2020-01-01T00:00:00.000Z')").run(hk.userId);
    assert.ok(purgeExpired() >= 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE id = 'expired-hk'").get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(hk.userId).n, 1);
  });

  // ---- in-app document reader -----------------------------------------------
  await check('document stream: access rules, headers, Range, and PDF.js can open it over HTTP', async () => {
    const { PDFDocument } = require('pdf-lib');
    const { createDownloadToken } = require('../src/lib/downloads');
    const pdf = await PDFDocument.create();
    for (let i = 0; i < 3; i += 1) pdf.addPage([300, 400]).drawText(`Page ${i + 1}`, { x: 40, y: 200 });
    const bytes = Buffer.from(await pdf.save());
    objects.set('product-files/reader-test.pdf', { body: bytes, contentType: 'application/pdf' });

    const { id } = addProduct(seller.creatorId, { title: 'Readable' });
    db.prepare('DELETE FROM product_files WHERE product_id = ?').run(id);
    db.prepare("INSERT INTO product_files (product_id, kind, storage_path, original_filename) VALUES (?, 'upload', 'product-files/reader-test.pdf', 'guide.pdf')").run(id);
    const reader = makeUser({ email: 'reader@example.invalid' });
    const buyerId = db.prepare('INSERT INTO buyers (name, email, user_id) VALUES (?, ?, ?)').run('r', 'reader@example.invalid', reader.userId).lastInsertRowid;
    const mkPurchase = status => db.prepare("INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_status) VALUES (?, ?, 500, 'USD', ?)").run(buyerId, id, status).lastInsertRowid;
    const paid = mkPurchase('paid');
    const token = createDownloadToken(paid);

    const full = await fetch(`${base}/api/downloads/${token}/stream`);
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('content-type'), 'application/pdf');
    assert.equal(full.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(full.headers.get('cache-control'), 'private, no-store');
    assert.equal(full.headers.get('accept-ranges'), 'bytes');
    assert.equal(Buffer.from(await full.arrayBuffer()).equals(bytes), true);

    const part = await fetch(`${base}/api/downloads/${token}/stream`, { headers: { Range: 'bytes=0-9' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), `bytes 0-9/${bytes.length}`);
    assert.equal((await part.arrayBuffer()).byteLength, 10);

    assert.equal((await fetch(`${base}/api/downloads/${token}/stream`, { headers: { Range: 'bytes=99999999-' } })).status, 416);
    assert.equal((await fetch(`${base}/api/downloads/${token}/stream`, { headers: { Range: 'garbage' } })).status, 200, 'malformed Range is ignored, not an error');
    assert.equal((await fetch(`${base}/api/downloads/not-a-real-token/stream`)).status, 404);
    assert.equal((await fetch(`${base}/api/downloads/${createDownloadToken(mkPurchase('pending'))}/stream`)).status, 403);
    const refunded = mkPurchase('paid');
    db.prepare("UPDATE purchases SET fulfillment_status = 'refunded' WHERE id = ?").run(refunded);
    assert.equal((await fetch(`${base}/api/downloads/${createDownloadToken(refunded)}/stream`)).status, 403);

    // The reader's engine lives in the client workspace; skip this one assertion
    // only if the client dependencies are not installed.
    let pdfjs = null;
    try { pdfjs = require('../client/node_modules/pdfjs-dist/legacy/build/pdf.js'); } catch { console.log('       (pdfjs-dist not installed in client/, skipping the PDF.js open check)'); }
    if (!pdfjs) return;
    const loaded = await pdfjs.getDocument({ url: `${base}/api/downloads/${token}/stream`, isEvalSupported: false, useSystemFonts: true }).promise;
    assert.equal(loaded.numPages, 3);
    await loaded.destroy();
  });

  await check('serial issue stream needs login and a paid purchase of that product', async () => {
    const serial = addProduct(seller.creatorId, { type: 'serial', title: 'Serial reader' });
    objects.set('issue-files/i1.pdf', { body: Buffer.from('%PDF-1.4 issue'), contentType: 'application/pdf' });
    const issueId = db.prepare("INSERT INTO issues (product_id, issue_number, title, kind, file_path, original_filename) VALUES (?, 1, 'One', 'upload', 'issue-files/i1.pdf', 'one.pdf')").run(serial.id).lastInsertRowid;
    const owner = makeUser({ email: 'issue-owner@example.invalid' });
    const stranger = makeUser({ email: 'issue-stranger@example.invalid' });
    const buyerId = db.prepare('INSERT INTO buyers (name, email, user_id) VALUES (?, ?, ?)').run('o', 'issue-owner@example.invalid', owner.userId).lastInsertRowid;
    db.prepare("INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_status) VALUES (?, ?, 500, 'USD', 'paid')").run(buyerId, serial.id);
    const url = `${base}/api/downloads/issue/${issueId}/stream`;
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { Cookie: stranger.cookie } })).status, 403);
    const ok = await fetch(url, { headers: { Cookie: owner.cookie } });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'application/pdf');
  });

  // ---- late payment reconciliation ----------------------------------------
  await check('a payment approved after the buyer left the page is completed once, on opening Account', async () => {
    const { id } = addProduct(seller.creatorId, { quantity_limit: 10 });
    const late = makeUser({ email: 'late@example.invalid' });
    const buyerId = db.prepare('INSERT INTO buyers (name, email, user_id) VALUES (?, ?, ?)').run('late', 'late@example.invalid', late.userId).lastInsertRowid;
    const pid = db.prepare("INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_status, payment_reference, created_at) VALUES (?, ?, 500, 'USD', 'pending', 'zs-late-1', datetime('now','-2 minutes'))").run(buyerId, id).lastInsertRowid;

    gatewayStatus = 'pending';
    let mine = await call('GET', '/api/purchases/mine', { cookie: late.cookie });
    assert.equal(mine.data.find(p => p.id === pid).payment_status, 'pending');

    gatewayStatus = 'success';
    mine = await call('GET', '/api/purchases/mine', { cookie: late.cookie });
    assert.equal(mine.data.find(p => p.id === pid).payment_status, 'paid');
    await call('GET', '/api/purchases/mine', { cookie: late.cookie });
    assert.equal(db.prepare('SELECT quantity_sold FROM products WHERE id = ?').get(id).quantity_sold, 1);
    gatewayStatus = 'pending';
  });

  await check('background sweep settles paid/failed orders, leaves fresh and day-old ones alone', async () => {
    const { reconcilePendingPayments } = require('../src/lib/reconcilePayments');
    const { id } = addProduct(seller.creatorId);
    const sweepUser = makeUser({ email: 'sweep@example.invalid' });
    const buyerId = db.prepare('INSERT INTO buyers (name, email, user_id) VALUES (?, ?, ?)').run('s', 'sweep@example.invalid', sweepUser.userId).lastInsertRowid;
    const insert = (ref, age) => db.prepare(`INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_status, payment_reference, created_at) VALUES (?, ?, 500, 'USD', 'pending', ?, datetime('now', ?))`).run(buyerId, id, ref, age).lastInsertRowid;
    const recent = insert('zs-sweep-recent', '-3 minutes');
    const fresh = insert('zs-sweep-fresh', '-2 seconds');
    const stale = insert('zs-sweep-stale', '-30 hours');
    const status = pid => db.prepare('SELECT payment_status FROM purchases WHERE id = ?').get(pid).payment_status;

    gatewayStatus = 'failed';
    await reconcilePendingPayments();
    assert.equal(status(recent), 'failed');
    assert.equal(status(fresh), 'pending', 'too new: the buyer own poll goes first');
    assert.equal(status(stale), 'pending', 'older than 24h is never touched');
    gatewayStatus = 'pending';
  });

  // ---- account security --------------------------------------------------
  const extraSession = (user, id) => db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .run(id, user.userId, new Date(Date.now() + 3600e3).toISOString());

  await check('payout number change needs the current password; other edits do not', async () => {
    const owner = makeUser({ email: 'payee@example.invalid', creator: true, password: true });
    const noPw = await call('PATCH', '/api/creators/me', { cookie: owner.cookie, json: { payout_ecocash_number: '0771234567' } });
    assert.equal(noPw.status, 403);
    assert.equal(noPw.data.code, 'REAUTH_REQUIRED');
    const wrongPw = await call('PATCH', '/api/creators/me', { cookie: owner.cookie, json: { payout_ecocash_number: '0771234567', current_password: 'nope-nope-1' } });
    assert.equal(wrongPw.status, 403);
    assert.equal(db.prepare('SELECT payout_ecocash_number FROM creators WHERE id = ?').get(owner.creatorId).payout_ecocash_number, null);

    const badFormat = await call('PATCH', '/api/creators/me', { cookie: owner.cookie, json: { payout_ecocash_number: 'not-a-number', current_password: PASSWORD } });
    assert.equal(badFormat.status, 400);

    const ok = await call('PATCH', '/api/creators/me', { cookie: owner.cookie, json: { payout_ecocash_number: '077 123 4567', current_password: PASSWORD } });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    const row = db.prepare('SELECT payout_ecocash_number, payout_changed_at FROM creators WHERE id = ?').get(owner.creatorId);
    assert.equal(row.payout_ecocash_number, '0771234567');
    assert.ok(row.payout_changed_at, 'change time should be recorded for the admin payout review');

    // Re-saving the same number (the Settings form always sends it) must not demand a password.
    const same = await call('PATCH', '/api/creators/me', { cookie: owner.cookie, json: { name: 'Renamed', payout_ecocash_number: '0771234567' } });
    assert.equal(same.status, 200);
  });

  await check('Google-style account (no password) changes payout with an emailed code, never a password', async () => {
    const g = makeUser({ email: 'google@example.invalid', creator: true });
    const patch = json => call('PATCH', '/api/creators/me', { cookie: g.cookie, json });
    const denied = await patch({ payout_ecocash_number: '0772222222' });
    assert.equal(denied.status, 403);
    assert.deepEqual(denied.data.methods, ['email_code']);
    assert.match(denied.data.error, /6-digit code/);

    const unverified = makeUser({ email: 'gu@example.invalid', creator: true, verified: false });
    assert.equal((await call('POST', '/api/creators/me/payout-code', { cookie: unverified.cookie })).status, 403);

    const before = sentEmails.length;
    assert.equal((await call('POST', '/api/creators/me/payout-code', { cookie: g.cookie })).status, 200);
    const mail = sentEmails.slice(before).find(m => m.to === 'google@example.invalid');
    const code = mail.body.match(/\b(\d{6})\b/)[1];

    assert.equal((await patch({ payout_ecocash_number: '0772222222', payout_code: code === '000000' ? '111111' : '000000' })).status, 403);
    const ok = await patch({ payout_ecocash_number: '0772222222', payout_code: code });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(db.prepare('SELECT payout_ecocash_number FROM creators WHERE id = ?').get(g.creatorId).payout_ecocash_number, '0772222222');
    // single use
    assert.equal((await patch({ payout_ecocash_number: '0773333333', payout_code: code })).status, 403);
  });

  await check('payout code dies after 5 wrong guesses even if later guessed right', async () => {
    const g = makeUser({ email: 'brute@example.invalid', creator: true });
    const before = sentEmails.length;
    await call('POST', '/api/creators/me/payout-code', { cookie: g.cookie });
    const code = sentEmails.slice(before).find(m => m.to === 'brute@example.invalid').body.match(/\b(\d{6})\b/)[1];
    const wrong = code === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await call('PATCH', '/api/creators/me', { cookie: g.cookie, json: { payout_ecocash_number: '0774444444', payout_code: wrong } })).status, 403);
    }
    assert.equal((await call('PATCH', '/api/creators/me', { cookie: g.cookie, json: { payout_ecocash_number: '0774444444', payout_code: code } })).status, 403);
  });

  await check('password account can also use an emailed code instead of the password', async () => {
    const p = makeUser({ email: 'both@example.invalid', creator: true, password: true });
    const before = sentEmails.length;
    await call('POST', '/api/creators/me/payout-code', { cookie: p.cookie });
    const code = sentEmails.slice(before).find(m => m.to === 'both@example.invalid').body.match(/\b(\d{6})\b/)[1];
    const res = await call('PATCH', '/api/creators/me', { cookie: p.cookie, json: { payout_ecocash_number: '0775555555', payout_code: code } });
    assert.equal(res.status, 200, JSON.stringify(res.data));
  });

  await check('change-password: wrong current is refused, success signs out other devices but keeps this one', async () => {
    const u = makeUser({ email: 'pw@example.invalid', password: true });
    extraSession(u, 'other-device-1'); extraSession(u, 'other-device-2');
    assert.equal((await call('POST', '/api/auth/change-password', { cookie: u.cookie, json: { current_password: 'wrong-wrong-1', new_password: 'brand-new-pass-1' } })).status, 401);
    assert.equal((await call('POST', '/api/auth/change-password', { cookie: u.cookie, json: { current_password: PASSWORD, new_password: 'short' } })).status, 400);
    const ok = await call('POST', '/api/auth/change-password', { cookie: u.cookie, json: { current_password: PASSWORD, new_password: 'brand-new-pass-1' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.signed_out_elsewhere, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(u.userId).n, 1);
    assert.equal((await call('GET', '/api/auth/security', { cookie: u.cookie })).status, 200);
    assert.ok(bcrypt.compareSync('brand-new-pass-1', db.prepare('SELECT password_hash FROM users WHERE id = ?').get(u.userId).password_hash));
  });

  await check('security panel lists sessions without leaking ids or hashes; revoke-others works', async () => {
    const u = makeUser({ email: 'sess@example.invalid', password: true });
    extraSession(u, 'secret-session-id-xyz');
    const view = await call('GET', '/api/auth/security', { cookie: u.cookie });
    assert.equal(view.data.sessions.length, 2);
    assert.equal(view.data.sessions.filter(s => s.current).length, 1);
    assert.ok(!JSON.stringify(view.data).includes('secret-session-id-xyz'));
    assert.ok(!JSON.stringify(view.data).includes('$2'));
    const res = await call('POST', '/api/auth/sessions/revoke-others', { cookie: u.cookie });
    assert.equal(res.data.revoked, 1);
    assert.equal((await call('GET', '/api/auth/security')).status, 401);
  });

  await check('repeated bad logins lock that account/IP combination, correct password is refused while locked', async () => {
    const u = makeUser({ email: 'lock@example.invalid', password: true });
    const attempt = pw => call('POST', '/api/auth/login', { json: { identifier: `user${n}`, password: pw } });
    for (let i = 0; i < 5; i += 1) assert.equal((await attempt('wrong-wrong-1')).status, 401);
    const locked = await attempt(PASSWORD);
    assert.equal(locked.status, 429);
    assert.match(locked.data.error, /Try again in/);
    void u;
  });

  server.close();
  const failed = results.filter(r => !r[1]);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
  console.log('Marketplace integrity checks passed.');
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
void PassThrough;
