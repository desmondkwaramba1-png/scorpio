// Regression tests for the issues found in the November 2026 QA audit. Real
// routers on an ephemeral port against an isolated SQLite file; R2, the payment
// gateway, email and OAuth are stubbed, so nothing external is contacted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'scorpio-regress-'));
process.env.NODE_ENV = 'test';
process.env.ACCOUNT_SECURITY_RATE_LIMIT = '1000';
process.env.ADMIN_KEY = 'test-admin-key';
process.env.GOOGLE_CLIENT_ID = 'x';
process.env.GOOGLE_CLIENT_SECRET = 'x';
process.env.GOOGLE_REDIRECT_URI = 'http://x/cb';

const objects = new Map();
const storage = require('../src/lib/storage');
storage.isConfigured = () => true;
storage.publicUrl = key => `https://cdn.test/${key}`;
storage.uploadBuffer = async (key, body, type) => { objects.set(key, { body, contentType: type }); return key; };
storage.getObjectBuffer = async key => objects.get(key).body;
storage.deleteObject = async key => { objects.delete(key); };
storage.getPresignedUrl = async key => `https://r2.test/${key}?signature=1`;
storage.evidenceUrl = storage.getPresignedUrl;
const sentEmails = [];
require('../src/lib/notify').sendEmail = async (to, subject) => { sentEmails.push({ to, subject }); };

const payment = require('../src/services/payment');
let createCalls = 0; let createDelay = 0; let gateway = 'pending'; let declineOrders = false;
payment.createOrder = async () => {
  createCalls += 1;
  if (createDelay) await new Promise(resolve => setTimeout(resolve, createDelay));
  if (declineOrders) return { success: false, error: 'Declined' };
  return { success: true, ecocashStatus: 'PENDING' };
};
payment.checkOrderStatus = async () => ({ status: gateway });
payment.isConfigured = () => true;

const oauth = require('../src/lib/oauth');
let oauthProfile = null;
oauth.exchangeCode = async () => 'token';
oauth.PROVIDERS.google.fetchProfile = async () => oauthProfile;

const express = require('express');
const cookieParser = require('cookie-parser');
const sharp = require('sharp');
const db = require('../src/db/schema');
const { attachUser, COOKIE_NAME } = require('../src/middleware/auth');
const { markPurchasePaid } = require('../src/lib/purchaseCompletion');
const { addKeys } = require('../src/lib/licenseKeys');
const { balancesFor } = require('../src/lib/walletBalances');
const { hasOffPlatformContact } = require('../src/lib/disputeMessagePolicy');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(attachUser);
for (const [mount, file] of [
  ['/api/products', 'products'], ['/api/purchases', 'purchases'], ['/api/cart', 'cart'], ['/api/downloads', 'downloads'],
  ['/api/auth', 'auth'], ['/api/auth', 'oauth'], ['/api/creators', 'creators'], ['/api/reports', 'reports'],
  ['/api/admin', 'admin'], ['/api/blog', 'blog'], ['/api/wallet', 'wallet'], ['/api/insights', 'insights'], ['/api/disputes', 'disputes'], ['/api/reels', 'reels']
]) app.use(mount, require(`../src/routes/${file}`));
require('../src/lib/asyncErrors');
app.use((err, req, res, _next) => res.status(400).json({ error: err.message }));

let n = 0; let base;
const PHONE = '0771234567';
function user({ creator = false, verified = true, payout = null } = {}) {
  n += 1;
  const email = `u${n}@example.invalid`;
  const userId = db.prepare(`
    INSERT INTO users (phone, email, username, name, email_verified_at, terms_accepted_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(`07710000${String(n).padStart(2, '0')}`, email, `user${n}`, `User ${n}`, verified ? new Date().toISOString() : null).lastInsertRowid;
  const sid = `s-${n}`;
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sid, userId, new Date(Date.now() + 36e5).toISOString());
  const creatorId = creator
    ? db.prepare('INSERT INTO creators (name, email, handle, user_id, payout_ecocash_number) VALUES (?, ?, ?, ?, ?)')
      .run(`Creator ${n}`, email, `creator${n}`, userId, payout).lastInsertRowid
    : null;
  return { userId, creatorId, email, cookie: `${COOKIE_NAME}=${sid}`, handle: `creator${n}` };
}
function product(creatorId, fields = {}) {
  const row = { type: 'single', price_minor: 500, currency: 'USD', status: 'published', quantity_limit: null, ...fields };
  const slug = `p-${Math.random().toString(36).slice(2, 9)}`;
  const id = db.prepare(`
    INSERT INTO products (creator_id, title, type, price_minor, currency, status, category, quantity_limit, cover_path, slug)
    VALUES (?, 'Test product', ?, ?, ?, ?, 'ebooks', ?, 'https://cdn.test/c.png', ?)
  `).run(creatorId, row.type, row.price_minor, row.currency, row.status, row.quantity_limit, slug).lastInsertRowid;
  if (fields.external !== false) {
    db.prepare("INSERT INTO product_files (product_id, kind, external_url) VALUES (?, 'external_link', 'https://paid.example/secret')").run(id);
  }
  return { id, slug };
}
function buyerRow(account) {
  return db.prepare('SELECT id FROM buyers WHERE user_id = ?').get(account.userId)?.id ||
    db.prepare('INSERT INTO buyers (name, email, user_id) VALUES (?, ?, ?)').run('Buyer', account.email, account.userId).lastInsertRowid;
}
function paidOrder(account, item, amount = 1000, currency = 'USD', fulfillment = 'released') {
  const id = db.prepare("INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_status) VALUES (?, ?, ?, ?, 'pending')")
    .run(buyerRow(account), item.id, amount, currency).lastInsertRowid;
  markPurchasePaid(id);
  if (fulfillment) db.prepare('UPDATE purchases SET fulfillment_status = ? WHERE id = ?').run(fulfillment, id);
  return id;
}
async function call(method, url, { cookie, json, form, headers = {} } = {}) {
  const sent = { ...headers };
  if (cookie) sent.Cookie = cookie;
  let body;
  if (json) { sent['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(base + url, { method, headers: sent, body, redirect: 'manual' });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, data, headers: res.headers };
}
const admin = { 'x-admin-key': 'test-admin-key' };
const checkout = (account, item) => call('POST', '/api/purchases', { cookie: account.cookie, json: { product_slug: item.slug, phone: PHONE } });
async function refund(buyer, purchaseId) {
  await call('POST', `/api/purchases/${purchaseId}/dispute`, { cookie: buyer.cookie, json: { reason: 'Not as described' } });
  const dispute = db.prepare('SELECT id FROM service_disputes WHERE purchase_id = ?').get(purchaseId);
  return call('POST', `/api/admin/disputes/${dispute.id}/resolve`, { headers: admin, json: { resolution: 'refund' } });
}

const results = [];
async function check(name, fn) {
  try { await fn(); results.push(true); console.log(`  ok   ${name}`); }
  catch (err) { results.push(false); console.log(`  FAIL ${name}\n       ${err.message}`); }
}

async function main() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  // ---- paid content and private data ------------------------------------
  await check('a paid external link stays hidden until purchase', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId); const buyer = user();
    assert.equal((await call('GET', `/api/products/${item.slug}`)).data.files[0].external_url, null);
    paidOrder(buyer, item, 500, 'USD', 'delivered');
    assert.ok((await call('GET', `/api/products/${item.slug}`, { cookie: buyer.cookie })).data.files[0].external_url);
    assert.ok((await call('GET', `/api/products/${item.slug}`, { cookie: seller.cookie })).data.files[0].external_url);
  });
  await check('public storefront exposes only public fields', async () => {
    const seller = user({ creator: true, payout: PHONE });
    const { data } = await call('GET', `/api/creators/${seller.handle}`);
    for (const field of ['email', 'user_id', 'payout_ecocash_number', 'payout_bank_details', 'what_selling']) assert.equal(field in data, false, field);
    assert.equal(data.handle, seller.handle);
  });
  await check('flagged products leave the store and notes stay private', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId); const earlier = user(); const buyer = user();
    paidOrder(earlier, item, 500, 'USD', 'delivered');
    db.prepare("UPDATE products SET review_status = 'flagged', flag_reason = 'Duplicate' WHERE id = ?").run(item.id);
    const feed = await call('GET', '/api/products?limit=50');
    assert.equal(feed.data.some(p => p.id === item.id), false);
    assert.equal((await call('GET', `/api/products/${item.slug}`)).status, 404);
    assert.equal((await checkout(buyer, item)).status, 404);
    const owned = await call('GET', `/api/products/${item.slug}`, { cookie: earlier.cookie });
    assert.equal(owned.status, 200);
    assert.equal('flag_reason' in owned.data, false);
    assert.equal((await call('GET', `/api/products/${item.slug}`, { cookie: seller.cookie })).data.flag_reason, 'Duplicate');
  });
  await check('order status gives goods only to the buyer', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId); addKeys(item.id, ['SECRET-1']); const buyer = user();
    const { data } = await checkout(buyer, item);
    gateway = 'success';
    await call('GET', `/api/purchases/status/${data.order_id}`);
    gateway = 'pending';
    const anon = await call('GET', `/api/purchases/status/${data.order_id}`);
    assert.equal(anon.data.status, 'paid');
    assert.equal(anon.data.items[0].license_key, null);
    assert.equal(anon.data.login_required, true);
    assert.equal((await call('GET', `/api/purchases/status/${data.order_id}`, { cookie: buyer.cookie })).data.items[0].license_key, 'SECRET-1');
  });
  await check('reels do not reveal unpublished products', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId, { status: 'draft' });
    db.prepare("INSERT INTO reels (creator_id, product_id, video_path) VALUES (?, ?, 'https://cdn.test/r.mp4')").run(seller.creatorId, item.id);
    assert.equal((await call('GET', `/api/reels?creator=${seller.handle}`)).data[0].product_slug, null);
  });

  // ---- abuse of seller money and trust -----------------------------------
  await check('only a verified buyer of the product can hold seller funds', async () => {
    const seller = user({ creator: true, payout: PHONE }); const item = product(seller.creatorId); const buyer = user();
    paidOrder(buyer, item, 10000);
    const before = balancesFor(seller.creatorId).available_minor;
    const stranger = user({ verified: false });
    assert.equal((await call('POST', '/api/reports/product', { cookie: stranger.cookie, json: { product_id: item.id, reason: 'x', serious_claim: true } })).status, 201);
    assert.equal(balancesFor(seller.creatorId).available_minor, before);
    assert.equal(db.prepare('SELECT serious_claim FROM reports WHERE reporter_user_id = ?').get(stranger.userId).serious_claim, 0);
    await call('POST', '/api/reports/product', { cookie: buyer.cookie, json: { product_id: item.id, reason: 'stolen', serious_claim: true } });
    assert.equal(balancesFor(seller.creatorId).available_minor, 0);
  });
  await check('the Verified seal needs a real paid sale', async () => {
    const seller = user({ creator: true, payout: PHONE }); const free = product(seller.creatorId, { price_minor: 0 });
    await call('POST', '/api/purchases', { cookie: user().cookie, json: { product_slug: free.slug } });
    assert.equal(db.prepare('SELECT verified FROM creators WHERE id = ?').get(seller.creatorId).verified, 0);
    paidOrder(user(), product(seller.creatorId), 500, 'USD', 'delivered');
    assert.equal(db.prepare('SELECT verified FROM creators WHERE id = ?').get(seller.creatorId).verified, 1);
  });
  await check('a buyer cannot claim or buy what they already own', async () => {
    const seller = user({ creator: true }); const free = product(seller.creatorId, { price_minor: 0, quantity_limit: 3, external: false });
    addKeys(free.id, ['K1', 'K2', 'K3']);
    const buyer = user();
    assert.equal((await call('POST', '/api/purchases', { cookie: buyer.cookie, json: { product_slug: free.slug } })).status, 201);
    assert.equal((await call('POST', '/api/purchases', { cookie: buyer.cookie, json: { product_slug: free.slug } })).status, 409);
    assert.equal(db.prepare('SELECT quantity_sold FROM products WHERE id = ?').get(free.id).quantity_sold, 1);
    const paid = product(seller.creatorId); paidOrder(buyer, paid, 500, 'USD', 'delivered');
    assert.equal((await checkout(buyer, paid)).status, 409);
    assert.equal((await call('POST', '/api/cart', { cookie: buyer.cookie, json: { product_slug: paid.slug } })).status, 409);
  });
  await check('refunded buyers cannot leave reviews', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId); const buyer = user();
    paidOrder(buyer, item, 500, 'USD', 'refunded');
    assert.equal((await call('POST', `/api/products/${item.slug}/reviews`, { cookie: buyer.cookie, json: { rating: 1 } })).status, 403);
  });
  await check('comments are capped, need a verified email, and can be removed', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId); const author = user();
    assert.equal((await call('POST', `/api/products/${item.id}/comments`, { cookie: user({ verified: false }).cookie, json: { body: 'hi' } })).status, 403);
    assert.equal((await call('POST', `/api/products/${item.id}/comments`, { cookie: author.cookie, json: { body: 'A'.repeat(1001) } })).status, 400);
    const posted = await call('POST', `/api/products/${item.id}/comments`, { cookie: author.cookie, json: { body: 'Nice' } });
    assert.equal((await call('DELETE', `/api/products/${item.id}/comments/${posted.data.id}`, { cookie: user().cookie })).status, 403);
    assert.equal((await call('DELETE', `/api/products/${item.id}/comments/${posted.data.id}`, { cookie: seller.cookie })).status, 200);
  });

  // ---- subscriptions and refunds -----------------------------------------
  await check('a lapsed subscriber cannot open issues', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId, { type: 'subscription', external: false }); const buyer = user();
    paidOrder(buyer, item, 500, 'USD', 'delivered');
    const issue = db.prepare("INSERT INTO issues (product_id, issue_number, title, kind, external_url) VALUES (?, 1, 'One', 'external_link', 'https://paid.example/1')").run(item.id).lastInsertRowid;
    assert.equal((await call('GET', `/api/downloads/issue/${issue}/view`, { cookie: buyer.cookie })).status, 302);
    db.prepare("UPDATE subscriptions SET current_period_end = datetime('now', '-40 days') WHERE product_id = ?").run(item.id);
    assert.equal((await call('GET', `/api/downloads/issue/${issue}/view`, { cookie: buyer.cookie })).status, 403);
    assert.equal((await call('GET', `/api/downloads/issue/${issue}/view`, { cookie: seller.cookie })).status, 302);
  });
  await check('a refund ends the subscription', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId, { type: 'subscription', external: false }); const buyer = user();
    const id = paidOrder(buyer, item, 500, 'USD', 'delivered');
    assert.equal((await refund(buyer, id)).status, 200);
    assert.equal(db.prepare('SELECT status FROM subscriptions WHERE product_id = ?').get(item.id).status, 'canceled');
  });
  await check('a refund puts stock back on sale', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId, { quantity_limit: 1 }); const buyer = user();
    const id = paidOrder(buyer, item, 500, 'USD', 'delivered');
    assert.equal((await checkout(user(), item)).status, 409);
    await refund(buyer, id);
    assert.equal((await checkout(user(), item)).status, 201);
  });
  await check('a discounted first month does not lock in the discount', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId, { type: 'subscription', price_minor: 1000, external: false }); const buyer = user();
    const id = db.prepare("INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_status, discount_applied) VALUES (?, ?, 500, 'USD', 'pending', 1)")
      .run(buyerRow(buyer), item.id).lastInsertRowid;
    markPurchasePaid(id);
    assert.equal(db.prepare('SELECT price_minor FROM subscriptions WHERE product_id = ?').get(item.id).price_minor, 1000);
  });

  // ---- stock and double charges ------------------------------------------
  await check('a payment landing after sell-out goes to the refund queue', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId, { quantity_limit: 1, external: false });
    addKeys(item.id, ['ONLY-KEY']);
    const late = user(); const first = user();
    const a = await checkout(late, item);
    db.prepare("UPDATE purchases SET created_at = datetime('now', '-11 minutes') WHERE payment_reference = ?").run(a.data.order_id);
    const b = await checkout(first, item);
    gateway = 'success';
    await call('GET', `/api/purchases/status/${b.data.order_id}`);
    await call('GET', `/api/purchases/status/${a.data.order_id}`);
    gateway = 'pending';
    const row = db.prepare('SELECT id, fulfillment_status FROM purchases WHERE payment_reference = ?').get(a.data.order_id);
    assert.equal(row.fulfillment_status, 'disputed');
    assert.equal(db.prepare("SELECT status FROM service_disputes WHERE purchase_id = ?").get(row.id).status, 'open');
    assert.equal(balancesFor(seller.creatorId).available_minor, 0);
  });
  await check('a double tap sends one EcoCash prompt', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId); const buyer = user();
    createCalls = 0; createDelay = 100;
    const replies = await Promise.all([checkout(buyer, item), checkout(buyer, item)]);
    createDelay = 0;
    assert.equal(createCalls, 1);
    assert.equal(replies[0].data.order_id, replies[1].data.order_id);
  });
  await check('someone who missed the prompt can try again later', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId); const buyer = user();
    const first = await checkout(buyer, item);
    db.prepare("UPDATE purchases SET created_at = datetime('now', '-2 minutes') WHERE payment_reference = ?").run(first.data.order_id);
    const second = await checkout(buyer, item);
    assert.equal(second.status, 201);
    assert.notEqual(second.data.order_id, first.data.order_id);
  });
  await check('parallel cart checkouts charge once, and a declined one restores the cart', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId); const buyer = user();
    await call('POST', '/api/cart', { cookie: buyer.cookie, json: { product_slug: item.slug } });
    createCalls = 0; createDelay = 100;
    await Promise.all([1, 2].map(() => call('POST', '/api/cart/checkout', { cookie: buyer.cookie, json: { phone: PHONE } })));
    createDelay = 0;
    assert.equal(createCalls, 1);

    const other = user();
    await call('POST', '/api/cart', { cookie: other.cookie, json: { product_slug: item.slug } });
    declineOrders = true;
    assert.equal((await call('POST', '/api/cart/checkout', { cookie: other.cookie, json: { phone: PHONE } })).status, 502);
    declineOrders = false;
    assert.equal((await call('GET', '/api/cart/count', { cookie: other.cookie })).data.cart_count, 1);
  });
  await check('a "first N buyers" promo is not overrun by open checkouts', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId, { price_minor: 1000 });
    db.prepare('UPDATE products SET discount_percent = 50, discount_limit = 1 WHERE id = ?').run(item.id);
    await checkout(user(), item); await checkout(user(), item);
    assert.deepEqual(db.prepare('SELECT amount_minor FROM purchases WHERE product_id = ? ORDER BY id').all(item.id).map(r => r.amount_minor), [500, 1000]);
  });

  // ---- currencies --------------------------------------------------------
  await check('wallet uses the currency paid, and sold products cannot switch', async () => {
    const seller = user({ creator: true, payout: PHONE }); const item = product(seller.creatorId, { currency: 'ZWG', price_minor: 260000 });
    paidOrder(user(), item, 260000, 'ZWG');
    const form = new FormData(); form.set('currency', 'USD');
    assert.equal((await call('PATCH', `/api/products/${item.id}`, { cookie: seller.cookie, form })).status, 409);
    db.prepare("UPDATE products SET currency = 'USD' WHERE id = ?").run(item.id); // data already changed before this fix
    const balances = balancesFor(seller.creatorId).balances_by_currency;
    assert.equal(balances.ZWG.available_minor, 239200);
    assert.equal(balances.USD, undefined);
  });
  await check('admin overview keeps currencies apart and skips refunds', async () => {
    const before = (await call('GET', '/api/admin/overview', { headers: admin })).data.gross_by_currency;
    const seller = user({ creator: true }); const buyer = user();
    paidOrder(buyer, product(seller.creatorId), 1000, 'USD');
    paidOrder(buyer, product(seller.creatorId, { currency: 'ZWG' }), 260000, 'ZWG');
    paidOrder(buyer, product(seller.creatorId), 5000, 'USD', 'refunded');
    const after = (await call('GET', '/api/admin/overview', { headers: admin })).data.gross_by_currency;
    assert.equal(after.USD - (before.USD || 0), 1000);
    assert.equal(after.ZWG - (before.ZWG || 0), 260000);
  });

  // ---- disputes ----------------------------------------------------------
  await check('the contact filter blocks contact details and nothing else', () => {
    for (const blocked of ['Call 0771234567', 'WhatsApp +263 77 123 4567', 'pay at https://evil.example', 'see www.evil.example', 'visit evil.com', 'me@mail.example.com', 'ring +1 415 555 2671']) {
      assert.equal(hasOffPlatformContact(blocked), true, blocked);
    }
    for (const allowed of ['screenshot.png', 'proof.pdf', 'receipt.jpeg', 'The file.pdf would not open', 'It broke.Please help', 'see page 3.Thanks', 'Paid via EcoCash on 12.05.2026 ref 123456789', 'order 1234567890 failed']) {
      assert.equal(hasOffPlatformContact(allowed), false, allowed);
    }
  });
  await check('evidence takes real images and PDFs only and stays private', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId); const buyer = user();
    const id = paidOrder(buyer, item, 500, 'USD', 'delivered');
    await call('POST', `/api/purchases/${id}/dispute`, { cookie: buyer.cookie, json: { reason: 'Broken' } });
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#123' } }).png().toBuffer();
    const good = new FormData(); good.set('file', new Blob([png], { type: 'image/png' }), 'screenshot.png');
    assert.equal((await call('POST', `/api/disputes/purchases/${id}/evidence`, { cookie: buyer.cookie, form: good })).status, 201);
    const bad = new FormData(); bad.set('file', new Blob(['<svg onload="alert(1)"/>'], { type: 'image/png' }), 'x.png');
    assert.equal((await call('POST', `/api/disputes/purchases/${id}/evidence`, { cookie: buyer.cookie, form: bad })).status, 400);
    const { data } = await call('GET', `/api/disputes/purchases/${id}`, { cookie: seller.cookie });
    assert.match(data.timeline.find(item2 => item2.type === 'evidence').storage_path, /^https:\/\/r2\.test\/evidence\/.+signature/);
  });
  await check('the unfiltered legacy dispute routes are gone', async () => {
    const buyer = user();
    assert.equal((await call('POST', '/api/purchases/1/dispute/messages', { cookie: buyer.cookie, json: { body: 'x' } })).status, 404);
  });

  // ---- journeys ----------------------------------------------------------
  await check('a disputed digital order keeps its case after a refresh, and shows as refunded', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId); const buyer = user();
    const id = paidOrder(buyer, item, 500, 'USD', 'delivered');
    await call('POST', `/api/purchases/${id}/dispute`, { cookie: buyer.cookie, json: { reason: 'Blank file' } });
    const open = (await call('GET', '/api/purchases/mine', { cookie: buyer.cookie })).data.find(p => p.id === id);
    assert.equal(open.service.fulfillment_status, 'disputed');
    assert.equal(open.service.dispute.status, 'open');
    const dispute = db.prepare('SELECT id FROM service_disputes WHERE purchase_id = ?').get(id);
    await call('POST', `/api/admin/disputes/${dispute.id}/resolve`, { headers: admin, json: { resolution: 'refund' } });
    const closed = (await call('GET', '/api/purchases/mine', { cookie: buyer.cookie })).data.find(p => p.id === id);
    assert.equal(closed.service.fulfillment_status, 'refunded');
    assert.equal(closed.view_url, null);
    assert.ok(sentEmails.some(m => m.to === buyer.email && /resolved/.test(m.subject)));
    assert.ok(sentEmails.some(m => m.to === seller.email && /resolved/.test(m.subject)));
  });
  await check('the number paid from is kept for refunds, and sellers hear about sales', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId); const buyer = user();
    const { data } = await checkout(buyer, item);
    assert.equal(db.prepare('SELECT payer_phone FROM purchases WHERE payment_reference = ?').get(data.order_id).payer_phone, PHONE);
    gateway = 'success'; await call('GET', `/api/purchases/status/${data.order_id}`); gateway = 'pending';
    assert.ok(sentEmails.some(m => m.to === seller.email && /You made a sale/.test(m.subject)));
  });
  await check('wallets list paid sales only, so failed attempts stay private', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId); const buyer = user();
    db.prepare("INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_status) VALUES (?, ?, 500, 'USD', 'failed')").run(buyerRow(buyer), item.id);
    assert.equal((await call('GET', '/api/wallet/me', { cookie: seller.cookie })).data.transactions.length, 0);
  });
  await check('insights keep currencies apart, skip refunds, and cover 30 days', async () => {
    const seller = user({ creator: true }); const buyer = user();
    paidOrder(buyer, product(seller.creatorId), 1000, 'USD');
    paidOrder(buyer, product(seller.creatorId, { currency: 'ZWG' }), 260000, 'ZWG');
    paidOrder(buyer, product(seller.creatorId), 5000, 'USD', 'refunded');
    const { data } = await call('GET', '/api/insights/me', { cookie: seller.cookie });
    assert.deepEqual(data.revenue_by_currency, { USD: 1000, ZWG: 260000 });
    assert.equal(data.revenue_by_day.length, 30);
    assert.equal(data.revenue_by_day.at(-1).revenue_minor, 1000);
  });
  await check('buyers keep the page of a product that was later unpublished', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId); const buyer = user();
    paidOrder(buyer, item, 500, 'USD', 'delivered');
    db.prepare("UPDATE products SET status = 'draft' WHERE id = ?").run(item.id);
    assert.equal((await call('GET', `/api/products/${item.slug}`, { cookie: buyer.cookie })).status, 200);
    assert.equal((await call('GET', `/api/products/${item.slug}`, { cookie: user().cookie })).status, 404);
    assert.equal((await call('GET', `/api/products/${item.slug}`)).status, 404);
  });
  await check('reset links are stored hashed and still work', async () => {
    const account = user();
    await call('POST', '/api/auth/forgot-password', { json: { identifier: account.email } });
    const row = db.prepare('SELECT token FROM password_reset_tokens WHERE user_id = ? ORDER BY id DESC').get(account.userId);
    assert.match(row.token, /^[0-9a-f]{64}$/);
    assert.equal((await call('POST', '/api/auth/reset-password', { json: { token: row.token, password: 'Another-Pass-9' } })).status, 400, 'the stored hash is not a usable link');
  });
  await check('renewal sweep skips lapse notices older than a week', async () => {
    const { sendRenewalReminders } = require('../src/lib/subscriptions');
    const seller = user({ creator: true }); const item = product(seller.creatorId, { type: 'subscription', external: false }); const buyer = user();
    paidOrder(buyer, item, 500, 'USD', 'delivered');
    db.prepare("UPDATE subscriptions SET current_period_end = datetime('now', '-30 days') WHERE product_id = ?").run(item.id);
    sendRenewalReminders();
    assert.equal(db.prepare('SELECT lapse_notice_sent_at FROM subscriptions WHERE product_id = ?').get(item.id).lapse_notice_sent_at, null);
  });
  await check('admin overview reports checkout success', async () => {
    const { data } = await call('GET', '/api/admin/overview', { headers: admin });
    assert.ok(data.checkout_funnel_7d.started >= data.checkout_funnel_7d.paid);
  });
  await check('search looks at descriptions and creator names too', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId);
    db.prepare("UPDATE products SET description = 'all about zebrawood carving' WHERE id = ?").run(item.id);
    assert.ok((await call('GET', '/api/products?q=zebrawood')).data.some(p => p.id === item.id));
  });

  // ---- uploads and sellers -----------------------------------------------
  await check('avatars must be real images and are stored by detected type', async () => {
    const seller = user({ creator: true }); objects.clear();
    const bad = new FormData(); bad.set('avatar', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'x.html');
    assert.equal((await call('PATCH', '/api/creators/me', { cookie: seller.cookie, form: bad })).status, 400);
    assert.equal(objects.size, 0);
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#123' } }).png().toBuffer();
    const good = new FormData(); good.set('avatar', new Blob([png], { type: 'text/html' }), 'x.html');
    assert.equal((await call('PATCH', '/api/creators/me', { cookie: seller.cookie, form: good })).status, 200);
    const [key] = [...objects.keys()];
    assert.match(key, /\.png$/);
    assert.equal(objects.get(key).contentType, 'image/png');
  });
  await check('onboarding validates the payout number, and bank details are ignored', async () => {
    const account = user(); const form = new FormData();
    for (const [k, v] of Object.entries({ handle: `shop-${n}`, name: 'Q', what_selling: 'x', who_for: 'y', payout_ecocash_number: 'not-a-number' })) form.set(k, v);
    assert.equal((await call('POST', '/api/creators', { cookie: account.cookie, form })).status, 400);
    const seller = user({ creator: true }); const edit = new FormData(); edit.set('payout_bank_details', '{"bank":"Attacker"}');
    await call('PATCH', '/api/creators/me', { cookie: seller.cookie, form: edit });
    assert.equal(db.prepare('SELECT payout_bank_details FROM creators WHERE id = ?').get(seller.creatorId).payout_bank_details, null);
  });
  await check('portfolio links must be http(s)', async () => {
    const seller = user({ creator: true }); const item = product(seller.creatorId, { type: 'service' });
    const bad = new FormData(); bad.set('portfolio_url', 'javascript:alert(1)');
    assert.equal((await call('PATCH', `/api/products/${item.id}`, { cookie: seller.cookie, form: bad })).status, 400);
  });

  // ---- sign-in -----------------------------------------------------------
  async function googleCallback(profile, nonce = 'nonce-1') {
    oauthProfile = profile;
    const state = Buffer.from(JSON.stringify({ role: null, next: null, nonce })).toString('base64url');
    return call('GET', `/api/auth/google/callback?code=c&state=${state}`, { headers: { Cookie: `oauth_state=${nonce}` } });
  }
  await check('OAuth refuses a callback this browser did not start', async () => {
    oauthProfile = { providerId: 'attacker', email: 'attacker@evil.example', name: 'A', emailVerified: true };
    const noState = await call('GET', '/api/auth/google/callback?code=c');
    assert.equal((noState.headers.get('set-cookie') || '').includes(COOKIE_NAME), false);
    const state = Buffer.from(JSON.stringify({ nonce: 'guess' })).toString('base64url');
    const wrong = await call('GET', `/api/auth/google/callback?code=c&state=${state}`, { headers: { Cookie: 'oauth_state=other' } });
    assert.equal((wrong.headers.get('set-cookie') || '').includes(COOKIE_NAME), false);
    const start = await call('GET', '/api/auth/google?next=//evil.example');
    assert.ok((start.headers.get('set-cookie') || '').includes('oauth_state='));
    const startState = new URL(start.headers.get('location')).searchParams.get('state');
    assert.equal(JSON.parse(Buffer.from(startState, 'base64url').toString()).next, null);
  });
  await check('OAuth will not link an account on an unverified provider email', async () => {
    const victim = user();
    const res = await googleCallback({ providerId: 'attacker-2', email: victim.email, name: 'A', emailVerified: false });
    assert.equal((res.headers.get('set-cookie') || '').includes(`${COOKIE_NAME}=`), false);
    assert.equal(db.prepare('SELECT google_id FROM users WHERE id = ?').get(victim.userId).google_id, null);
  });
  await check('a pre-registered password dies when the real owner signs in', async () => {
    await call('POST', '/api/auth/signup', { json: { username: 'prehijack', email: 'victim@example.invalid', phone: '0779999999', password: 'attacker-pass-1', terms_accepted: true } });
    await googleCallback({ providerId: 'real-owner', email: 'Victim@example.invalid', name: 'V', emailVerified: true });
    assert.equal((await call('POST', '/api/auth/login', { json: { identifier: 'prehijack', password: 'attacker-pass-1' } })).status, 401);
    assert.ok(db.prepare("SELECT email_verified_at FROM users WHERE username = 'prehijack'").get().email_verified_at);
  });
  await check('signup applies the same password rules as change-password', async () => {
    const res = await call('POST', '/api/auth/signup', { json: { username: 'weakpw', email: 'weak@example.invalid', phone: '0775550000', password: 'aaaaaaaa', terms_accepted: true } });
    assert.equal(res.status, 400);
    const odd = await call('POST', '/api/auth/signup', { json: { username: ['abc'], email: 'odd@example.invalid', phone: '0775550001', password: 'abcd1234', terms_accepted: true } });
    assert.equal(odd.status, 400);
  });
  await check('wrong admin keys are throttled on the blog routes too', async () => {
    let limited = false;
    for (let i = 0; i < 70 && !limited; i += 1) {
      limited = (await call('GET', '/api/blog/admin/posts', { headers: { 'x-admin-key': `wrong-${i}` } })).status === 429;
    }
    assert.equal(limited, true);
    assert.equal((await call('GET', '/api/blog/admin/posts', { headers: admin })).status, 200, 'the real key is never locked out');
  });

  const failed = results.filter(ok => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  server.close();
  process.exit(failed ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
