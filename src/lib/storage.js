// Cloudflare R2 (S3-compatible object storage) — replaces the local-disk
// uploads/ directory. R2 speaks the S3 API, so the standard AWS SDK works
// against it unmodified, just pointed at R2's endpoint instead of AWS's.
//
// Two access patterns, matching two real categories of file on this
// platform:
//   - PUBLIC objects (covers, avatars, reels, preview clips) — anyone can
//     view these regardless of purchase, so they're uploaded with a
//     public-read key prefix and served straight from R2's public URL.
//     publicUrl(key) builds that URL; nothing ever needs a signed link for
//     these.
//   - PRIVATE objects (the actual paid product files) — must stay gated
//     behind the existing download-token system (src/routes/downloads.js
//     already validates the token, expiry, and download count before
//     anything here gets called). getPresignedUrl() mints a short-lived
//     signed GET URL only after that validation passes, and the route
//     redirects the browser to it — R2 then serves the bytes directly
//     (including Range requests, so video seeking still works), instead of
//     this server streaming the file itself.
//
// If R2 isn't configured (no keys set), isConfigured() returns false and
// callers fall back to erroring clearly rather than silently pretending
// uploads work — same "stub-first, never a fake success" rule as
// payment.js and notify.js.

// Required lazily, inside getClient()/getPresignedUrl() below, not at
// module load time. This file gets pulled in by every route that touches
// an upload (auth.js, creators.js, products.js, reels.js, purchases.js),
// which used to mean a missing/uninstalled @aws-sdk package took the
// entire server down at boot — every route, not just the ones that
// actually needed R2. Lazy require means the rest of the app works fine
// with R2 simply reporting isConfigured() === false until the package
// (and the env vars) are actually in place.
let S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, getSignedUrl, Upload;
function loadSdk() {
  if (S3Client) return;
  ({ S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3'));
  ({ getSignedUrl } = require('@aws-sdk/s3-request-presigner'));
  ({ Upload } = require('@aws-sdk/lib-storage'));
}

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET_NAME;
// The domain public objects are actually reachable at — either R2's own
// <bucket>.r2.dev dev subdomain, or a custom domain mapped to the bucket
// (cdn.scorpio.co.zw) once one exists. No trailing slash.
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

function isConfigured() {
  return !!(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET && PUBLIC_URL);
}

let client = null;
function getClient() {
  loadSdk();
  if (client) return client;
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY }
  });
  return client;
}

// For small objects already held in memory, such as processed covers.
async function uploadBuffer(key, buffer, contentType) {
  if (!isConfigured()) throw new Error('File storage is not configured (R2 env vars missing).');
  await getClient().send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType
  }));
  return key;
}

async function uploadStream(key, body, contentType) {
  if (!isConfigured()) throw new Error('File storage is not configured (R2 env vars missing).');
  const upload = new Upload({
    client: getClient(),
    params: { Bucket: BUCKET, Key: key, Body: body, ContentType: contentType },
    queueSize: 2,
    partSize: 5 * 1024 * 1024,
    leavePartsOnError: false
  });
  await upload.done();
  return key;
}

async function getObjectStream(key) {
  if (!isConfigured()) throw new Error('File storage is not configured (R2 env vars missing).');
  const result = await getClient().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return { stream: result.Body, size: result.ContentLength };
}

async function getObjectBuffer(key, maxBytes) {
  const { stream, size } = await getObjectStream(key);
  if (size > maxBytes) {
    stream.destroy();
    throw new Error(`Object exceeds the ${maxBytes}-byte in-memory processing limit.`);
  }
  const chunks = [];
  let bytesRead = 0;
  for await (const chunk of stream) {
    bytesRead += chunk.length;
    if (bytesRead > maxBytes) {
      stream.destroy();
      throw new Error(`Object exceeds the ${maxBytes}-byte in-memory processing limit.`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, bytesRead);
}

function publicUrl(key) {
  return `${PUBLIC_URL}/${key}`;
}

// Short-lived (default 5 minutes) — long enough for a download to start,
// short enough that a leaked/logged URL isn't a standing access grant.
// contentDisposition lets a caller force "Save As <original filename>"
// (downloads.js's /:token route) vs leaving it unset for inline viewing
// (the /:token/view route, where a <video> needs to just play, not prompt
// a save dialog — R2 still honors Range requests either way, so seeking
// works on the redirected URL exactly like it did streaming from local disk).
async function getPresignedUrl(key, { expiresInSeconds = 300, contentDisposition } = {}) {
  if (!isConfigured()) throw new Error('File storage is not configured (R2 env vars missing).');
  // getClient() as its own statement, not inlined as an argument below —
  // a call expression's callee (getSignedUrl) resolves to a value before
  // any of its arguments are evaluated, so inlining getClient() as an
  // argument would read getSignedUrl while it's still undefined (loadSdk()
  // hasn't populated it yet at that point).
  const s3 = getClient();
  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: BUCKET, Key: key,
    ...(contentDisposition ? { ResponseContentDisposition: contentDisposition } : {})
  }), { expiresIn: expiresInSeconds });
}

// Product rows hold either a bare R2 key (private files) or a full public
// URL (covers, previews). Anything else - legacy /uploads paths, bundled seed
// art - is not ours to delete, so it maps to null.
const OWNED_PREFIXES = /^(covers|product-files|previews|issue-files)\//;
function keyFromReference(ref) {
  if (typeof ref !== 'string' || !ref) return null;
  let key = ref;
  if (/^https?:\/\//.test(ref)) {
    if (!PUBLIC_URL || !ref.startsWith(PUBLIC_URL + '/')) return null;
    key = ref.slice(PUBLIC_URL.length + 1);
  }
  return OWNED_PREFIXES.test(key) && !key.includes('..') ? key : null;
}

async function deleteObject(key) {
  if (!isConfigured()) return;
  await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

module.exports = {
  isConfigured, uploadBuffer, uploadStream, getObjectStream, getObjectBuffer,
  publicUrl, getPresignedUrl, deleteObject, keyFromReference
};
