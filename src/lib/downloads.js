const db = require('../db/schema');
const { generateToken } = require('./tokens');

const TTL_DAYS = 7;
const MAX_DOWNLOADS = 20;

// One product_files row per product for now (the primary deliverable —
// serial-issue-level delivery is a separate, not-yet-built flow).
function getProductFile(productId) {
  return db.prepare('SELECT * FROM product_files WHERE product_id = ? LIMIT 1').get(productId);
}

function productHasFile(productId) {
  return !!getProductFile(productId);
}

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.ogg', '.m4v', '.avi', '.mkv'];
function isVideoFilename(name) {
  if (!name) return false;
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
}

// .ogg is deliberately absent here — it's ambiguous between audio and video
// containers, and isVideoFilename already claims it.
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.wma'];
function isAudioFilename(name) {
  if (!name) return false;
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  return AUDIO_EXTENSIONS.includes(ext);
}

function createDownloadToken(purchaseId) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    'INSERT INTO download_tokens (purchase_id, token, expires_at, max_downloads) VALUES (?, ?, ?, ?)'
  ).run(purchaseId, token, expiresAt, MAX_DOWNLOADS);
  return token;
}

function getActiveTokenForPurchase(purchaseId) {
  return db.prepare(
    "SELECT * FROM download_tokens WHERE purchase_id = ? AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1"
  ).get(purchaseId);
}

module.exports = {
  createDownloadToken, getActiveTokenForPurchase, productHasFile, getProductFile, isVideoFilename, isAudioFilename,
  TTL_DAYS, MAX_DOWNLOADS
};
