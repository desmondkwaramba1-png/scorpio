const sharp = require('sharp');

// Uploaded covers and avatars come straight off a seller's phone — often
// several MB at 3000px+ wide, which is wildly oversized for anything this
// app actually displays (the biggest render anywhere is a product cover
// capped at 280px tall). Resizing and re-compressing right after upload is
// what actually moves the needle on page load speed; nothing on the CSS
// side touches this.
//
// Takes and returns a Buffer — nothing here touches disk. Uploads go
// straight from multer.memoryStorage() to here to R2 (src/lib/storage.js),
// so there's no local file to read or write back to at any point.
// Re-encodes in the SAME format the file came in.
async function optimizeImage(buffer, { maxWidth, maxHeight } = {}) {
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    // Not a real image (or already corrupt) — the upload's own fileFilter
    // already gated on mimetype, so this is a defensive no-op, not the
    // expected path. Return the original buffer unchanged.
    return buffer;
  }

  // An animated GIF loses its animation the moment it goes through this
  // still-image resize/encode pipeline — leave it exactly as uploaded
  // rather than silently breaking it.
  if (meta.format === 'gif' && meta.pages > 1) return buffer;

  const pipeline = sharp(buffer).rotate(); // no args: auto-orient from EXIF, then strip the tag
  if (maxWidth || maxHeight) {
    pipeline.resize({ width: maxWidth, height: maxHeight, fit: 'inside', withoutEnlargement: true });
  }

  const encode = {
    jpeg: () => pipeline.jpeg({ quality: 82, mozjpeg: true }),
    png: () => pipeline.png({ compressionLevel: 9 }),
    webp: () => pipeline.webp({ quality: 82 }),
    gif: () => pipeline.gif()
  }[meta.format] || (() => pipeline.jpeg({ quality: 82, mozjpeg: true }));

  return encode().toBuffer();
}

module.exports = { optimizeImage };
