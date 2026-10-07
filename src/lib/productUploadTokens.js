const { createHash, randomBytes } = require('crypto');
const db = require('../db/schema');

const TOKEN_TTL_MINUTES = 15;

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function issueProductUploadToken({ creatorId, requestKey, method, productId = null }) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000).toISOString();

  db.prepare("DELETE FROM product_upload_tokens WHERE julianday(expires_at) <= julianday('now')").run();
  db.prepare('DELETE FROM product_upload_tokens WHERE creator_id = ? AND request_key = ?')
    .run(creatorId, requestKey);
  db.prepare(`
    INSERT INTO product_upload_tokens
      (token_hash, creator_id, request_key, method, product_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(hashToken(token), creatorId, requestKey, method, productId, expiresAt);

  return { token, expiresAt };
}

function findProductUploadToken({ token, requestKey, method, productId = null }) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) ||
      typeof requestKey !== 'string' || !['POST', 'PATCH'].includes(method)) return null;
  return db.prepare(`
    SELECT creator_id, request_key, method, product_id
    FROM product_upload_tokens
    WHERE token_hash = ?
      AND request_key = ?
      AND method = ?
      AND product_id IS ?
      AND julianday(expires_at) > julianday('now')
  `).get(hashToken(token), requestKey, method, productId) || null;
}

module.exports = { issueProductUploadToken, findProductUploadToken };
