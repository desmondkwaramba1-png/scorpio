const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scorpio-product-upload-'));
process.env.DATA_DIR = dataDir;

const db = require('../src/db/schema');
const { issueProductUploadToken, findProductUploadToken } = require('../src/lib/productUploadTokens');

try {
  const creatorId = db.prepare('INSERT INTO creators (name, email) VALUES (?, ?)')
    .run('Upload Token Creator', 'upload-token-creator@example.invalid').lastInsertRowid;
  const productId = db.prepare(`
    INSERT INTO products (creator_id, title, type, price_minor, currency, status, slug, category)
    VALUES (?, 'Upload Token Product', 'single', 100, 'USD', 'draft', 'upload-token-product', 'ebooks')
  `).run(creatorId).lastInsertRowid;
  const requestKey = 'product-publish-request-123';

  const postToken = issueProductUploadToken({ creatorId, requestKey, method: 'POST' });
  assert.equal(postToken.token.length, 64);
  assert.equal(
    findProductUploadToken({ token: postToken.token, requestKey, method: 'POST' }).creator_id,
    creatorId
  );
  assert.equal(findProductUploadToken({ token: postToken.token, requestKey, method: 'PATCH' }), null);
  assert.equal(findProductUploadToken({ token: postToken.token, requestKey: 'other-request-key', method: 'POST' }), null);
  assert.equal(findProductUploadToken({ token: `${postToken.token.slice(1)}0`, requestKey, method: 'POST' }), null);
  assert.equal(findProductUploadToken({ token: postToken.token, method: 'POST' }), null);

  const patchToken = issueProductUploadToken({ creatorId, requestKey, method: 'PATCH', productId });
  assert.equal(findProductUploadToken({
    token: postToken.token, requestKey, method: 'POST'
  }), null);
  assert.equal(findProductUploadToken({
    token: patchToken.token, requestKey, method: 'PATCH', productId
  }).creator_id, creatorId);
  assert.equal(findProductUploadToken({
    token: patchToken.token, requestKey, method: 'PATCH', productId: productId + 1
  }), null);

  db.prepare("UPDATE product_upload_tokens SET expires_at = datetime('now', '-1 minute') WHERE token_hash = ?")
    .run(require('node:crypto').createHash('sha256').update(patchToken.token).digest('hex'));
  assert.equal(findProductUploadToken({
    token: patchToken.token, requestKey, method: 'PATCH', productId
  }), null);

  console.log('Product upload token scope, method, request key, and expiry checks passed.');
} finally {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
