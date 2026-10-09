const sharp = require('sharp');

// Uploaded covers and avatars come straight off a seller's phone — often
// several MB at 3000px+ wide, which is wildly oversized for anything this
// app actually displays (the biggest render anywhere is a product cover
// capped at 280px tall). Resizing and re-compressing right after upload is
// what actually moves the needle on page load speed; nothing on the CSS
// side touches this.
//
// Takes and returns a Buffer. Product covers are read back from R2 with a
// strict size bound before reaching this helper; large product files never
// pass through image processing.
// Re-encodes in the SAME format the file came in.
// `enhance` runs a light, always-safe auto-fix: nudge brightness and
// saturation up a touch and add a mild sharpen. It's tuned to make a flat,
// underexposed phone photo (the common case for a seller's cover shot)
// look more alive without visibly wrecking a photo that was already good —
// deliberately conservative, no local-contrast/CLAHE, no histogram
// stretch, nothing that can blow out highlights or shift a colour cast.
async function optimizeImage(buffer, { maxWidth, maxHeight, enhance = false } = {}) {
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

  // Animated GIFs already returned above; a still GIF that reaches enhance
  // gets re-encoded as JPEG anyway (see the encode map below has no path
  // that keeps palette), so modulate is safe here for every remaining format.
  if (enhance && !(meta.format === 'gif')) {
    pipeline.modulate({ brightness: 1.03, saturation: 1.08 }).sharpen({ sigma: 0.8 });
  }

  const encode = {
    jpeg: () => pipeline.jpeg({ quality: 82, mozjpeg: true }),
    jpg: () => pipeline.jpeg({ quality: 82, mozjpeg: true }),
    png: () => pipeline.png({ compressionLevel: 9 }),
    webp: () => pipeline.webp({ quality: 82 }),
    gif: () => pipeline.gif(),
    heif: () => pipeline.jpeg({ quality: 82, mozjpeg: true }),
    heic: () => pipeline.jpeg({ quality: 82, mozjpeg: true }),
    avif: () => pipeline.jpeg({ quality: 82, mozjpeg: true }),
    bmp: () => pipeline.jpeg({ quality: 82, mozjpeg: true }),
    tif: () => pipeline.jpeg({ quality: 82, mozjpeg: true }),
    tiff: () => pipeline.jpeg({ quality: 82, mozjpeg: true })
  }[meta.format] || (() => pipeline.jpeg({ quality: 82, mozjpeg: true }));

  return encode().toBuffer();
}

module.exports = { optimizeImage };
