const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scorpio-fund-holds-'));
process.env.DATA_DIR = dataDir;

const db = require('../src/db/schema');
const { balancesFor } = require('../src/lib/walletBalances');
const { createDownloadToken } = require('../src/lib/downloads');
const { markPurchasePaid } = require('../src/lib/purchaseCompletion');

try {
  const creatorId = db.prepare('INSERT INTO creators (name, email) VALUES (?, ?)')
    .run('Test Creator', 'fund-holds-creator@example.invalid').lastInsertRowid;
  const buyerId = db.prepare('INSERT INTO buyers (name, email) VALUES (?, ?)')
    .run('Test Buyer', 'fund-holds-buyer@example.invalid').lastInsertRowid;
  const insertProduct = db.prepare(`
    INSERT INTO products (creator_id, title, type, price_minor, currency, status, slug, category)
    VALUES (?, ?, 'single', ?, ?, 'published', ?, 'ebooks')
  `);
  const usdPaidOutProduct = insertProduct.run(creatorId, 'Paid product', 1000, 'USD', 'fund-paid').lastInsertRowid;
  const usdSeriousProduct = insertProduct.run(creatorId, 'Under review', 2000, 'USD', 'fund-review').lastInsertRowid;
  const usdDisputedProduct = insertProduct.run(creatorId, 'Order dispute', 500, 'USD', 'fund-dispute').lastInsertRowid;
  const zwgProduct = insertProduct.run(creatorId, 'Different currency', 5000, 'ZWG', 'fund-zwg').lastInsertRowid;
  const insertPurchase = db.prepare(`
    INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_status, fulfillment_status, delivered_at)
    VALUES (?, ?, ?, ?, 'paid', ?, datetime('now'))
  `);
  insertPurchase.run(buyerId, usdPaidOutProduct, 1000, 'USD', 'released');
    const seriousPurchaseId = insertPurchase.run(buyerId, usdSeriousProduct, 2000, 'USD', 'released').lastInsertRowid;
  const disputedPurchaseId = insertPurchase.run(buyerId, usdDisputedProduct, 500, 'USD', 'disputed').lastInsertRowid;
  insertPurchase.run(buyerId, zwgProduct, 5000, 'ZWG', 'released');

  db.prepare('INSERT INTO payouts (creator_id, amount_minor, currency) VALUES (?, ?, ?)')
    .run(creatorId, 920, 'USD');
  db.prepare(`
    INSERT INTO reports (product_id, reporter_user_id, reporter_role, reason, status, serious_claim)
    VALUES (?, NULL, NULL, 'Serious product allegation', 'open', 1)
  `).run(usdSeriousProduct);
  db.prepare(`
    INSERT INTO service_disputes (purchase_id, reason, status, serious_claim)
    VALUES (?, 'Order delivery issue', 'open', 0)
  `).run(disputedPurchaseId);

  let balances = balancesFor(creatorId).balances_by_currency;
  assert.equal(balances.USD.product_hold_minor, 1840);
  assert.equal(balances.USD.escrowed_minor, 460);
  assert.equal(balances.USD.available_minor, 0);
  assert.equal(balances.ZWG.product_hold_minor, 0);
  assert.equal(balances.ZWG.available_minor, 4600);

  db.prepare("UPDATE reports SET status = 'resolved' WHERE product_id = ?").run(usdSeriousProduct);
  balances = balancesFor(creatorId).balances_by_currency;
  assert.equal(balances.USD.product_hold_minor, 0);
  assert.equal(balances.USD.available_minor, 1840);

  const payoutId = db.prepare('INSERT INTO payouts (creator_id, amount_minor, currency) VALUES (?, 1000, ?)')
    .run(creatorId, 'USD').lastInsertRowid;
  db.prepare('INSERT INTO payout_allocations (payout_id, purchase_id, amount_minor) VALUES (?, ?, ?)')
    .run(payoutId, seriousPurchaseId, 1000);
  db.prepare("UPDATE reports SET status = 'open' WHERE product_id = ?").run(usdSeriousProduct);
  balances = balancesFor(creatorId).balances_by_currency;
  assert.equal(balances.USD.product_hold_minor, 840);
  assert.equal(balances.USD.available_minor, 0);

  const token = createDownloadToken(disputedPurchaseId);
  const tokenRow = db.prepare('SELECT expires_at, max_downloads FROM download_tokens WHERE token = ?').get(token);
  assert.equal(tokenRow.expires_at, '9999-12-31T23:59:59.999Z');
  assert.equal(tokenRow.max_downloads, null);

  const freeProduct = insertProduct.run(creatorId, 'Free PDF', 0, 'USD', 'fund-free-pdf').lastInsertRowid;
  db.prepare(`
    INSERT INTO product_files (product_id, kind, storage_path, original_filename)
    VALUES (?, 'upload', 'product-files/free.pdf', 'free.pdf')
  `).run(freeProduct);
  const freePurchaseId = db.prepare(`
    INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_status)
    VALUES (?, ?, 0, 'USD', 'pending')
  `).run(buyerId, freeProduct).lastInsertRowid;

  const completed = markPurchasePaid(freePurchaseId);
  assert.equal(completed.payment_status, 'paid');
  assert.equal(completed.fulfillment_status, 'delivered');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM download_tokens WHERE purchase_id = ?').get(freePurchaseId).n, 1);
  markPurchasePaid(freePurchaseId);
  assert.equal(db.prepare('SELECT quantity_sold FROM products WHERE id = ?').get(freeProduct).quantity_sold, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM download_tokens WHERE purchase_id = ?').get(freePurchaseId).n, 1);

  const subscriptionProduct = db.prepare(`
    INSERT INTO products (creator_id, title, type, price_minor, currency, status, slug, category)
    VALUES (?, 'Monthly series', 'subscription', 1200, 'USD', 'published', 'fund-subscription', 'ebooks')
  `).run(creatorId).lastInsertRowid;
  const subscriptionPurchaseId = db.prepare(`
    INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_status)
    VALUES (?, ?, 1200, 'USD', 'pending')
  `).run(buyerId, subscriptionProduct).lastInsertRowid;
  db.exec(`
    CREATE TRIGGER fail_subscription_completion
    BEFORE INSERT ON subscriptions
    BEGIN
      SELECT RAISE(ABORT, 'forced subscription completion failure');
    END;
  `);
  assert.throws(() => markPurchasePaid(subscriptionPurchaseId), /forced subscription completion failure/);
  const rolledBackPurchase = db.prepare('SELECT payment_status, fulfillment_status FROM purchases WHERE id = ?')
    .get(subscriptionPurchaseId);
  assert.equal(rolledBackPurchase.payment_status, 'pending');
  assert.equal(rolledBackPurchase.fulfillment_status, null);
  assert.equal(db.prepare('SELECT quantity_sold FROM products WHERE id = ?').get(subscriptionProduct).quantity_sold, 0);
  db.exec('DROP TRIGGER fail_subscription_completion');

  const subscriptionPurchase = markPurchasePaid(subscriptionPurchaseId);
  assert.equal(subscriptionPurchase.payment_status, 'paid');
  assert.equal(subscriptionPurchase.fulfillment_status, 'delivered');
  assert.ok(subscriptionPurchase.subscription_id);
  assert.equal(
    db.prepare('SELECT status FROM subscriptions WHERE id = ?').get(subscriptionPurchase.subscription_id).status,
    'active'
  );
  markPurchasePaid(subscriptionPurchaseId);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM subscriptions WHERE buyer_id = ? AND product_id = ?')
    .get(buyerId, subscriptionProduct).n, 1);

  const legacyProduct = insertProduct.run(creatorId, 'Previously fulfilled product', 500, 'USD', 'fund-legacy').lastInsertRowid;
  const legacyPurchaseId = db.prepare(`
    INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_status, fulfillment_status)
    VALUES (?, ?, 500, 'USD', 'pending', 'released')
  `).run(buyerId, legacyProduct).lastInsertRowid;
  db.exec(fs.readFileSync(path.join(__dirname, '../src/db/migrations/041_repair_fulfilled_purchase_status.sql'), 'utf8'));
  assert.equal(db.prepare('SELECT payment_status FROM purchases WHERE id = ?').get(legacyPurchaseId).payment_status, 'paid');

  console.log('Fund-hold, payout-currency, migration, lifetime-token, and free-purchase access checks passed.');
} finally {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}