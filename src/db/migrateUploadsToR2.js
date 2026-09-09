// One-time migration: moves every file currently sitting in the local
// uploads/ directory (or the mounted Fly volume, in production — see
// lib/paths.js) up to R2, and rewrites the DB rows that pointed at the old
// /uploads/... path to point at the new R2 location instead.
//
// Safe to re-run: a row whose path no longer starts with /uploads/ is
// already migrated and gets skipped, so running this twice (e.g. after a
// partial failure) just picks up where it left off rather than re-
// uploading everything or double-processing rows.
//
// Run locally with: node src/db/migrateUploadsToR2.js
// Run against production (Fly): fly ssh console -C "node src/db/migrateUploadsToR2.js"
const fs = require('fs');
const path = require('path');
const db = require('./schema');
const storage = require('../lib/storage');
const { UPLOADS_DIR } = require('../lib/paths');

function isLocalUploadPath(p) {
  return typeof p === 'string' && p.startsWith('/uploads/');
}

// Public objects (cover_path, avatar_path, video_path, preview_video_path,
// service delivery storage_path): re-uploaded and the column gets the new
// public R2 URL, same shape the app already expects there.
async function migratePublicColumn(table, idColumn, pathColumn, keyPrefix) {
  const rows = db.prepare(`SELECT ${idColumn} AS id, ${pathColumn} AS p FROM ${table} WHERE ${pathColumn} LIKE '/uploads/%'`).all();
  console.log(`${table}.${pathColumn}: ${rows.length} to migrate`);
  for (const row of rows) {
    const filename = path.basename(row.p);
    const localPath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(localPath)) {
      console.warn(`  skip ${table}#${row.id}: local file missing (${localPath})`);
      continue;
    }
    const buffer = fs.readFileSync(localPath);
    const key = `${keyPrefix}/${filename}`;
    const contentType = guessContentType(filename);
    await storage.uploadBuffer(key, buffer, contentType);
    const url = storage.publicUrl(key);
    db.prepare(`UPDATE ${table} SET ${pathColumn} = ? WHERE ${idColumn} = ?`).run(url, row.id);
    console.log(`  migrated ${table}#${row.id} -> ${url}`);
  }
}

// Private objects (product_files.storage_path, kind='upload' only) — the
// column becomes the bare R2 key, not a public URL, same convention
// products.js now writes for new uploads (see routes/downloads.js for how
// it's read back via a presigned URL).
async function migrateProductFiles() {
  const rows = db.prepare(`SELECT id, storage_path FROM product_files WHERE kind = 'upload' AND storage_path LIKE '/uploads/%'`).all();
  console.log(`product_files.storage_path: ${rows.length} to migrate`);
  for (const row of rows) {
    const filename = path.basename(row.storage_path);
    const localPath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(localPath)) {
      console.warn(`  skip product_files#${row.id}: local file missing (${localPath})`);
      continue;
    }
    const buffer = fs.readFileSync(localPath);
    const key = `product-files/${filename}`;
    const contentType = guessContentType(filename);
    await storage.uploadBuffer(key, buffer, contentType);
    db.prepare('UPDATE product_files SET storage_path = ? WHERE id = ?').run(key, row.id);
    console.log(`  migrated product_files#${row.id} -> ${key}`);
  }
}

const EXT_TYPES = {
  '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif'
};
function guessContentType(filename) {
  return EXT_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

async function main() {
  if (!storage.isConfigured()) {
    console.error('R2 is not configured (check R2_* env vars). Nothing to do.');
    process.exit(1);
  }
  await migratePublicColumn('products', 'id', 'cover_path', 'covers');
  await migratePublicColumn('products', 'id', 'preview_video_path', 'previews');
  await migratePublicColumn('creators', 'id', 'avatar_path', 'avatars');
  await migratePublicColumn('users', 'id', 'avatar_url', 'avatars');
  await migratePublicColumn('reels', 'id', 'video_path', 'reels');
  await migratePublicColumn('service_deliveries', 'id', 'storage_path', 'deliveries');
  await migrateProductFiles();
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
