const fs = require('fs/promises');
const sharp = require('sharp');

// Uploaded covers and avatars come straight off a seller's phone — often
// several MB at 3000px+ wide, which is wildly oversized for anything this
// app actually displays (the biggest render anywhere is a product cover
// capped at 280px tall). Resizing and re-compressing right after upload is
// what actually moves the needle on page load speed; nothing on the CSS
// side touches this.
//
// Re-encodes in the SAME format the file came in — the on-disk filename
// (and therefore its extension) is already fixed by multer before this
// runs, so switching formats here would leave a real mismatch between the
// extension and the bytes on disk.
async function optimizeImage(filePath, { maxWidth, maxHeight } = {}) {
  let meta;
  try {
    meta = await sharp(filePath).metadata();
  } catch {
    // Not a real image (or already corrupt) — the upload's own fileFilter
    // already gated on mimetype, so this is a defensive no-op, not the
    // expected path.
    return;
  }

  // An animated GIF loses its animation the moment it goes through this
  // still-image resize/encode pipeline — leave it exactly as uploaded
  // rather than silently breaking it.
  if (meta.format === 'gif' && meta.pages > 1) return;

  const pipeline = sharp(filePath).rotate(); // no args: auto-orient from EXIF, then strip the tag
  if (maxWidth || maxHeight) {
    pipeline.resize({ width: maxWidth, height: maxHeight, fit: 'inside', withoutEnlargement: true });
  }

  const encode = {
    jpeg: () => pipeline.jpeg({ quality: 82, mozjpeg: true }),
    png: () => pipeline.png({ compressionLevel: 9 }),
    webp: () => pipeline.webp({ quality: 82 }),
    gif: () => pipeline.gif()
  }[meta.format] || (() => pipeline.jpeg({ quality: 82, mozjpeg: true }));

  const buffer = await encode().toBuffer();

  // Not a direct overwrite: sharp/libvips can still hold the source file
  // open at this point (confirmed on Windows — writeFile straight back to
  // filePath throws EBUSY-equivalent), so this writes to a sibling temp
  // file and atomically renames it over the original instead.
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, buffer);
  await fs.rename(tmpPath, filePath);
}

module.exports = { optimizeImage };
