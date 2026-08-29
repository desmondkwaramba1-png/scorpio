const db = require('../db/schema');

function productHasKeys(productId) {
  return !!db.prepare('SELECT 1 FROM license_keys WHERE product_id = ?').get(productId);
}

function unclaimedCount(productId) {
  return db.prepare('SELECT COUNT(*) AS n FROM license_keys WHERE product_id = ? AND claimed_at IS NULL').get(productId).n;
}

// better-sqlite3 runs every statement synchronously on one connection, so
// there's no interleaving between two "claim" calls the way there would be
// with an async driver — the WHERE claimed_at IS NULL is enough to make
// this correct, no retry loop needed.
function claimKeyForPurchase(productId, purchaseId) {
  const key = db.prepare(
    'SELECT id FROM license_keys WHERE product_id = ? AND claimed_at IS NULL ORDER BY id ASC LIMIT 1'
  ).get(productId);
  if (!key) return null;
  db.prepare("UPDATE license_keys SET claimed_at = datetime('now'), purchase_id = ? WHERE id = ?").run(purchaseId, key.id);
  return db.prepare('SELECT * FROM license_keys WHERE id = ?').get(key.id);
}

function keyForPurchase(purchaseId) {
  return db.prepare('SELECT key_value FROM license_keys WHERE purchase_id = ?').get(purchaseId);
}

// Additive — re-uploading a batch tops up stock rather than replacing it,
// so a creator can paste more keys later without touching what's already
// been claimed.
function addKeys(productId, keyValues) {
  const insert = db.prepare('INSERT INTO license_keys (product_id, key_value) VALUES (?, ?)');
  const run = db.transaction((values) => { for (const v of values) insert.run(productId, v); });
  run(keyValues);
  return keyValues.length;
}

function keyStats(productId) {
  const total = db.prepare('SELECT COUNT(*) AS n FROM license_keys WHERE product_id = ?').get(productId).n;
  const unclaimed = unclaimedCount(productId);
  return { total, unclaimed, claimed: total - unclaimed };
}

module.exports = { productHasKeys, unclaimedCount, claimKeyForPurchase, keyForPurchase, addKeys, keyStats };
