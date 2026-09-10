const express = require('express');
const multer = require('multer');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../db/schema');
const { requireAuth, requireCreator } = require('../middleware/auth');
const { toMinor } = require('../lib/money');
const { checkAndUpdateVerification } = require('../lib/verification');
const { CATEGORY_VALUES } = require('../lib/categories');
const { EBOOKS_ONLY, ACTIVE_CATEGORY_VALUES } = require('../lib/launchScope');
const { isPromoActive, applyDiscount } = require('../lib/promotions');
const { addKeys, keyStats } = require('../lib/licenseKeys');
const { runVerification } = require('../lib/contentVerification');
const { optimizeImage } = require('../lib/imageProcessing');
const storage = require('../lib/storage');

const router = express.Router();

// Uploads are served back out as static files with whatever content-type
// the extension implies, so an unrestricted cover upload is a stored-XSS
// hole waiting to happen (an uploaded .svg or .html served at its own URL
// renders — and executes — as a real page if anyone navigates straight to
// it). The deliverable ('file') gets its own rule: while EBOOKS_ONLY, a
// listing is either a single PDF (ebooks/templates) or a single video
// (courses) — which one depends on `category`, which isn't reliably known
// yet inside a multer fileFilter (multipart field order isn't guaranteed
// to put the 'category' text field ahead of the 'file' stream), so this
// stays permissive at the filter level and the real, category-specific
// check runs after multer finishes parsing — see checkDeliverableType
// below, called from both POST and PATCH once req.body is complete.
const COVER_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const PDF_TYPE = 'application/pdf';
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
function productFileFilter(req, file, cb) {
  if (file.fieldname === 'cover') {
    if (COVER_IMAGE_TYPES.has(file.mimetype)) return cb(null, true);
    return cb(new Error('Cover must be an image (JPEG, PNG, WebP, or GIF).'));
  }
  if (file.fieldname === 'preview_video') {
    if (VIDEO_TYPES.has(file.mimetype)) return cb(null, true);
    return cb(new Error('The free preview clip must be a video (MP4, WebM, or MOV).'));
  }
  if (EBOOKS_ONLY && file.mimetype !== PDF_TYPE && !VIDEO_TYPES.has(file.mimetype)) {
    return cb(new Error('The product file must be a PDF (for ebooks/templates) or a video (MP4, WebM, or MOV, for courses).'));
  }
  cb(null, true);
}

// The strict, category-aware pass productFileFilter above can't safely do.
// Nothing to clean up on rejection anymore — memoryStorage below never
// wrote the file to this server's disk (or to R2) in the first place, so
// there's no orphan to delete, unlike the old disk-based version of this.
function checkDeliverableType(file, category) {
  if (!file || !EBOOKS_ONLY) return null;
  const isCourseVideo = category === 'courses' && VIDEO_TYPES.has(file.mimetype);
  const isDocPdf = category !== 'courses' && file.mimetype === PDF_TYPE;
  if (isCourseVideo || isDocPdf) return null;
  return category === 'courses'
    ? "A course's file must be a video (MP4, WebM, or MOV)."
    : 'The product file must be a PDF.';
}

// req.file.buffer, never a path on this server's own disk — validated here,
// then either uploaded to R2 (storage.js) as a public object (cover,
// preview clip) or a private one (the paid deliverable, only ever reached
// again through a presigned URL — see routes/downloads.js).
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: productFileFilter,
  // A cover is always a small image; the deliverable can now be a real
  // course video. One shared limit since multer applies it per-upload-
  // instance, not per-field — generous enough for a real 30-60 minute
  // course video at reasonable compression.
  limits: { fileSize: 500 * 1024 * 1024 }
});

// R2 object keys — prefix says which bucket "folder" and whether it's a
// public or private object, extension kept for a sane Content-Type/browser
// hint, uuid keeps two uploads from ever colliding.
function objectKey(prefix, originalname) {
  return `${prefix}/${randomUUID()}${path.extname(originalname)}`;
}

// Attaches the buyer-facing promo fields every product response needs:
// whether a promo is currently active, and what it actually charges. Also
// attaches key stock — total_keys is 0 for the vast majority of products
// that don't use license keys at all, so callers can treat "total_keys > 0"
// as "this is a keyed product" without a separate flag.
function withPromo(product) {
  const active = !product.pay_what_you_want && isPromoActive(product);
  product.promo_active = active;
  product.discounted_price_minor = active ? applyDiscount(product.price_minor, product.discount_percent) : null;
  const stats = keyStats(product.id);
  product.total_keys = stats.total;
  product.unclaimed_keys = stats.unclaimed;
  return product;
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).slice(2, 6);
}

// One key per line from the creator's textarea — blank lines and stray
// whitespace are the only "formatting" a paste from a spreadsheet or a
// license-generator tool needs cleaning up.
function parseKeyList(raw) {
  if (!raw) return [];
  return raw.split('\n').map(k => k.trim()).filter(Boolean);
}

// Runs the real file checks (contentVerification.js) on an uploaded
// product file, records the result on the product_files row, and flags
// the product if anything's actually wrong. The duplicate-hash check is
// scoped to OTHER creators only — a seller re-uploading their own
// unchanged file (editing price, say, without touching the file) is not
// "suspicious," it's just normal editing, so it's explicitly excluded
// here rather than left to accidentally self-flag on every edit.
async function verifyAndRecordFile(productId, creatorId, file, title, description) {
  const result = await runVerification({
    buffer: file.buffer, claimedMimeType: file.mimetype, title, description
  });

  const duplicate = db.prepare(`
    SELECT p.id, p.title, c.handle AS creator_handle
    FROM product_files pf
    JOIN products p ON p.id = pf.product_id
    JOIN creators c ON c.id = p.creator_id
    WHERE pf.file_hash = ? AND p.creator_id != ? AND p.id != ?
    LIMIT 1
  `).get(result.hash, creatorId, productId);

  const flags = [...result.flags];
  if (duplicate) {
    flags.push(`Identical file already listed as "${duplicate.title}" by @${duplicate.creator_handle}.`);
  }

  db.prepare(`
    UPDATE product_files SET file_hash = ?, detected_mime = ?, page_count = ?
    WHERE product_id = ?
  `).run(result.hash, result.detectedMime, result.pageCount, productId);

  if (flags.length > 0) {
    db.prepare("UPDATE products SET review_status = 'flagged', flag_reason = ? WHERE id = ?")
      .run(flags.join(' '), productId);
    if (duplicate) {
      db.prepare("UPDATE products SET review_status = 'flagged', flag_reason = ? WHERE id = ? AND review_status = 'clear'")
        .run(`Identical file also listed by another creator (product #${productId}).`, duplicate.id);
    }
  }
}

const FEED_SELECT = `
  SELECT p.*, c.name as creator_name, c.handle as creator_handle,
         c.verified as creator_verified, c.avatar_path as creator_avatar,
         (SELECT COUNT(*) FROM product_likes WHERE product_id = p.id) AS like_count,
         (SELECT COUNT(*) FROM product_comments WHERE product_id = p.id) AS comment_count,
         (SELECT COUNT(*) FROM product_shares WHERE product_id = p.id) AS share_count,
         (SELECT ROUND(AVG(rating), 1) FROM product_reviews WHERE product_id = p.id) AS avg_rating,
         (SELECT COUNT(*) FROM product_reviews WHERE product_id = p.id) AS review_count,
         EXISTS(SELECT 1 FROM product_likes WHERE product_id = p.id AND user_id = ?) AS liked_by_me
  FROM products p
  JOIN creators c ON c.id = p.creator_id
`;

// GET /api/products — the public /discover feed. type, q (title search),
// sort=new|price_asc|price_desc|popular|bestselling, limit (homepage rails).
router.get('/', (req, res) => {
  const { type, q, sort, limit, category } = req.query;
  const clauses = ["p.status = 'published'"];
  const params = [req.user ? req.user.id : 0];

  if (type && ['single', 'serial'].includes(type)) {
    clauses.push('p.type = ?');
    params.push(type);
  }
  if (category && CATEGORY_VALUES.includes(category) && (!EBOOKS_ONLY || ACTIVE_CATEGORY_VALUES.includes(category))) {
    clauses.push('p.category = ?');
    params.push(category);
  } else if (EBOOKS_ONLY) {
    // No specific (active) category asked for — while EBOOKS_ONLY, the
    // public feed only ever shows the active launch categories, regardless
    // of what legacy products exist in the DB from before launch scope
    // narrowed, or what category a caller tries to request directly.
    // Keeps the storefront coherent with what creators are actually
    // allowed to list right now (see POST below).
    clauses.push(`p.category IN (${ACTIVE_CATEGORY_VALUES.map(() => '?').join(',')})`);
    params.push(...ACTIVE_CATEGORY_VALUES);
  }
  if (q) {
    clauses.push('p.title LIKE ?');
    params.push(`%${q}%`);
  }

  const orderBy = {
    price_asc: 'p.price_minor ASC',
    price_desc: 'p.price_minor DESC',
    popular: 'like_count DESC, p.created_at DESC',
    bestselling: 'p.quantity_sold DESC, p.created_at DESC'
  }[sort] || 'p.created_at DESC';

  const capped = Math.min(parseInt(limit, 10) || 0, 50);
  const limitSql = capped > 0 ? ' LIMIT ?' : '';
  if (capped > 0) params.push(capped);

  const products = db.prepare(
    `${FEED_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY ${orderBy}${limitSql}`
  ).all(...params);

  res.json(products.map(withPromo));
});

// GET /api/products/mine — the logged-in creator's own products, any status.
// Must be declared before /:slug so "mine" isn't parsed as a slug.
router.get('/mine', requireAuth, requireCreator, (req, res) => {
  const products = db.prepare(`
    SELECT p.*,
           f.kind AS file_kind, f.original_filename AS file_name, f.external_url AS file_external_url,
           EXISTS(SELECT 1 FROM purchases WHERE product_id = p.id) AS has_purchases
    FROM products p
    LEFT JOIN product_files f ON f.product_id = p.id
    WHERE p.creator_id = ?
    ORDER BY p.created_at DESC
  `).all(req.creator.id);
  res.json(products.map(withPromo));
});

// GET /api/products/:slug — public product page. Drafts are only visible
// to their owner (previewing before publish).
router.get('/:slug', (req, res) => {
  const product = db.prepare(`
    SELECT p.*, c.name as creator_name, c.handle as creator_handle, c.bio as creator_bio,
           c.verified as creator_verified, c.avatar_path as creator_avatar
    FROM products p
    JOIN creators c ON c.id = p.creator_id
    WHERE p.slug = ?
  `).get(req.params.slug);

  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const isOwner = req.creator && req.creator.id === product.creator_id;
  if (product.status !== 'published' && !isOwner) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  if (product.type === 'serial') {
    product.issues = db.prepare(
      'SELECT * FROM issues WHERE product_id = ? ORDER BY issue_number DESC'
    ).all(product.id);
  }
  product.files = db.prepare(
    'SELECT id, kind, external_url, original_filename FROM product_files WHERE product_id = ?'
  ).all(product.id);

  product.like_count = db.prepare('SELECT COUNT(*) AS n FROM product_likes WHERE product_id = ?').get(product.id).n;
  product.comment_count = db.prepare('SELECT COUNT(*) AS n FROM product_comments WHERE product_id = ?').get(product.id).n;
  product.share_count = db.prepare('SELECT COUNT(*) AS n FROM product_shares WHERE product_id = ?').get(product.id).n;
  product.avg_rating = db.prepare('SELECT ROUND(AVG(rating), 1) AS n FROM product_reviews WHERE product_id = ?').get(product.id).n;
  product.review_count = db.prepare('SELECT COUNT(*) AS n FROM product_reviews WHERE product_id = ?').get(product.id).n;
  product.liked_by_me = req.user
    ? !!db.prepare('SELECT 1 FROM product_likes WHERE product_id = ? AND user_id = ?').get(product.id, req.user.id)
    : false;

  res.json(withPromo(product));
});

// POST /api/products/:id/like — toggles the current user's like.
router.post('/:id/like', requireAuth, (req, res) => {
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const existing = db.prepare('SELECT id FROM product_likes WHERE product_id = ? AND user_id = ?')
    .get(product.id, req.user.id);

  if (existing) {
    db.prepare('DELETE FROM product_likes WHERE id = ?').run(existing.id);
  } else {
    db.prepare('INSERT INTO product_likes (product_id, user_id) VALUES (?, ?)').run(product.id, req.user.id);
  }

  const count = db.prepare('SELECT COUNT(*) AS n FROM product_likes WHERE product_id = ?').get(product.id).n;
  res.json({ liked: !existing, like_count: count });
});

// GET /api/products/:id/comments
router.get('/:id/comments', (req, res) => {
  const comments = db.prepare(`
    SELECT pc.id, pc.body, pc.created_at, u.username, u.avatar_url
    FROM product_comments pc
    JOIN users u ON u.id = pc.user_id
    WHERE pc.product_id = ?
    ORDER BY pc.created_at ASC
  `).all(req.params.id);
  res.json(comments);
});

// POST /api/products/:id/comments
router.post('/:id/comments', requireAuth, (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Comment cannot be empty.' });

  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const result = db.prepare('INSERT INTO product_comments (product_id, user_id, body) VALUES (?, ?, ?)')
    .run(product.id, req.user.id, body.trim());

  const comment = db.prepare(`
    SELECT pc.id, pc.body, pc.created_at, u.username, u.avatar_url
    FROM product_comments pc JOIN users u ON u.id = pc.user_id WHERE pc.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(comment);
});

// POST /api/products/:id/share — counts a share-button click. No login
// required (same as every share button on the web, this counts intent to
// share, not a confirmed post on the other platform — there's no way for
// any site to verify that from a share link).
router.post('/:id/share', (req, res) => {
  const { channel } = req.body;
  const validChannels = ['native', 'whatsapp', 'facebook', 'instagram', 'tiktok', 'copy_link'];
  if (!validChannels.includes(channel)) {
    return res.status(400).json({ error: 'channel must be one of: ' + validChannels.join(', ') });
  }
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  db.prepare('INSERT INTO product_shares (product_id, user_id, channel) VALUES (?, ?, ?)')
    .run(product.id, req.user ? req.user.id : null, channel);

  const count = db.prepare('SELECT COUNT(*) AS n FROM product_shares WHERE product_id = ?').get(product.id).n;
  res.json({ share_count: count });
});

// GET /api/products/:slug/reviews — public reviews + aggregate. When
// logged in, also reports whether this buyer has a paid, not-yet-reviewed
// purchase of this product (eligible_to_review) and their own review if
// they've already left one — the frontend uses these to show "write a
// review", "edit your review", or nothing, instead of showing a form to
// someone who never bought the thing and letting them hit a 403.
router.get('/:slug/reviews', (req, res) => {
  const product = db.prepare('SELECT id FROM products WHERE slug = ?').get(req.params.slug);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const reviews = db.prepare(`
    SELECT pr.id, pr.rating, pr.body, pr.created_at, u.username, u.avatar_url
    FROM product_reviews pr
    JOIN users u ON u.id = pr.user_id
    WHERE pr.product_id = ?
    ORDER BY pr.created_at DESC
  `).all(product.id);

  const agg = db.prepare(
    'SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS review_count FROM product_reviews WHERE product_id = ?'
  ).get(product.id);

  let myReview = null;
  let eligibleToReview = false;
  if (req.user) {
    myReview = db.prepare(`
      SELECT pr.id, pr.rating, pr.body, pr.created_at
      FROM product_reviews pr
      JOIN purchases pu ON pu.id = pr.purchase_id
      JOIN buyers b ON b.id = pu.buyer_id
      WHERE pr.product_id = ? AND b.user_id = ?
    `).get(product.id, req.user.id);

    if (!myReview) {
      eligibleToReview = !!db.prepare(`
        SELECT pu.id FROM purchases pu
        JOIN buyers b ON b.id = pu.buyer_id
        WHERE pu.product_id = ? AND b.user_id = ? AND pu.payment_status = 'paid'
          AND NOT EXISTS (SELECT 1 FROM product_reviews WHERE purchase_id = pu.id)
        LIMIT 1
      `).get(product.id, req.user.id);
    }
  }

  res.json({
    reviews, avg_rating: agg.avg_rating, review_count: agg.review_count,
    my_review: myReview, eligible_to_review: eligibleToReview
  });
});

// POST /api/products/:slug/reviews — leaves a review against the buyer's
// oldest paid, not-yet-reviewed purchase of this product. "Actually bought
// it" is enforced by the join itself (never trusted from the client), and
// the purchases.buyer_id -> user_id chain is the same ownership pattern
// purchases.js already uses.
router.post('/:slug/reviews', requireAuth, (req, res) => {
  const { rating, body } = req.body;
  const ratingNum = parseInt(rating, 10);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ error: 'rating must be a whole number from 1 to 5.' });
  }

  const product = db.prepare('SELECT id FROM products WHERE slug = ?').get(req.params.slug);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const purchase = db.prepare(`
    SELECT pu.id FROM purchases pu
    JOIN buyers b ON b.id = pu.buyer_id
    WHERE pu.product_id = ? AND b.user_id = ? AND pu.payment_status = 'paid'
      AND NOT EXISTS (SELECT 1 FROM product_reviews WHERE purchase_id = pu.id)
    ORDER BY pu.created_at ASC LIMIT 1
  `).get(product.id, req.user.id);

  if (!purchase) {
    return res.status(403).json({ error: "You can only review a product you've actually bought, once per order." });
  }

  const result = db.prepare(`
    INSERT INTO product_reviews (product_id, purchase_id, user_id, rating, body)
    VALUES (?, ?, ?, ?, ?)
  `).run(product.id, purchase.id, req.user.id, ratingNum, (body || '').trim() || null);

  const review = db.prepare(`
    SELECT pr.id, pr.rating, pr.body, pr.created_at, u.username, u.avatar_url
    FROM product_reviews pr JOIN users u ON u.id = pr.user_id WHERE pr.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(review);
});

// PATCH /api/products/:slug/reviews/mine — edit your own review.
router.patch('/:slug/reviews/mine', requireAuth, (req, res) => {
  const product = db.prepare('SELECT id FROM products WHERE slug = ?').get(req.params.slug);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const review = db.prepare(`
    SELECT pr.* FROM product_reviews pr
    JOIN purchases pu ON pu.id = pr.purchase_id
    JOIN buyers b ON b.id = pu.buyer_id
    WHERE pr.product_id = ? AND b.user_id = ?
  `).get(product.id, req.user.id);
  if (!review) return res.status(404).json({ error: "You haven't reviewed this product." });

  const { rating, body } = req.body;
  let ratingNum = review.rating;
  if (rating !== undefined) {
    ratingNum = parseInt(rating, 10);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: 'rating must be a whole number from 1 to 5.' });
    }
  }

  db.prepare(`UPDATE product_reviews SET rating = ?, body = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(ratingNum, body !== undefined ? ((body || '').trim() || null) : review.body, review.id);

  res.json(db.prepare(`
    SELECT pr.id, pr.rating, pr.body, pr.created_at, u.username, u.avatar_url
    FROM product_reviews pr JOIN users u ON u.id = pr.user_id WHERE pr.id = ?
  `).get(review.id));
});

// DELETE /api/products/:slug/reviews/mine
router.delete('/:slug/reviews/mine', requireAuth, (req, res) => {
  const product = db.prepare('SELECT id FROM products WHERE slug = ?').get(req.params.slug);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const review = db.prepare(`
    SELECT pr.id FROM product_reviews pr
    JOIN purchases pu ON pu.id = pr.purchase_id
    JOIN buyers b ON b.id = pu.buyer_id
    WHERE pr.product_id = ? AND b.user_id = ?
  `).get(product.id, req.user.id);
  if (!review) return res.status(404).json({ error: "You haven't reviewed this product." });

  db.prepare('DELETE FROM product_reviews WHERE id = ?').run(review.id);
  res.json({ ok: true });
});

// POST /api/products — creator_id always comes from the session, never the
// client, so nobody can publish a product under someone else's storefront.
// Cover image is required, enforced here and not just in the form.
router.post('/', requireAuth, requireCreator, upload.fields([
  { name: 'cover', maxCount: 1 },
  { name: 'file', maxCount: 1 },
  { name: 'preview_video', maxCount: 1 }
]), async (req, res) => {
  const {
    title, description, type, category, price, currency,
    pay_what_you_want, min_price, quantity_limit, status, external_url, license_keys,
    portfolio_url, delivery_days, service_terms
  } = req.body;
  const cover = req.files?.cover?.[0];
  const file = req.files?.file?.[0];
  const previewVideo = req.files?.preview_video?.[0];
  const keyList = parseKeyList(license_keys);
  const isService = type === 'service';

  if (!title || !type || !category) {
    return res.status(400).json({ error: 'title, type, and category are required.' });
  }
  if (!cover) {
    return res.status(400).json({ error: 'A cover image is required.' });
  }
  if (!['single', 'serial', 'service'].includes(type)) {
    return res.status(400).json({ error: "type must be 'single', 'serial', or 'service'." });
  }
  if (!CATEGORY_VALUES.includes(category)) {
    return res.status(400).json({ error: 'category must be a recognized category.' });
  }
  if (EBOOKS_ONLY && !ACTIVE_CATEGORY_VALUES.includes(category)) {
    return res.status(400).json({ error: 'New listings are ebooks, guides & templates, and courses only for now. More categories are coming soon.' });
  }
  if (EBOOKS_ONLY && isService) {
    return res.status(400).json({ error: 'Service listings are paused while we launch with a smaller category set. Coming back soon.' });
  }
  const deliverableError = checkDeliverableType(file, category);
  if (deliverableError) return res.status(400).json({ error: deliverableError });
  // A service has nothing to hand over at listing time by design — the
  // work doesn't exist yet, only the seller's portfolio and track record
  // do. What a buyer gets is delivered per-order later (see
  // POST /:id/deliver), not attached to the listing itself.
  const willPublish = status !== 'draft';
  if (willPublish && !isService && !file && !external_url && keyList.length === 0) {
    return res.status(400).json({ error: 'Attach a file, an external link, or paste license keys before publishing. Buyers need something to actually receive.' });
  }
  if (isService && pay_what_you_want) {
    return res.status(400).json({ error: "Services can't be pay-what-you-want. A price the buyer trusts up front is part of what escrow protects." });
  }

  const isPWYW = pay_what_you_want === 'true' || pay_what_you_want === true;
  const priceMinor = toMinor(price);
  if (!isPWYW && (priceMinor === null || priceMinor <= 0)) {
    return res.status(400).json({ error: 'price must be a positive number.' });
  }
  let minPriceMinor = null;
  if (isPWYW) {
    minPriceMinor = min_price ? toMinor(min_price) : 0;
    if (minPriceMinor === null || minPriceMinor < 0) {
      return res.status(400).json({ error: 'min_price must be zero or a positive number.' });
    }
  }
  if (!storage.isConfigured()) {
    return res.status(503).json({ error: 'File storage is not configured yet. Try again shortly.' });
  }

  // Every validation above has passed — only now do the actual R2 uploads,
  // so a request that was going to be rejected anyway never wastes one.
  //
  // These three are independent of each other (each is its own R2 object,
  // none reads what another writes), so they run concurrently instead of
  // one-after-another — a course with a cover, a free preview clip, and
  // the real video file used to pay for all three uploads' latency added
  // together in serial; now it pays for whichever one is slowest.
  const uploadCover = (async () => {
    let coverBuffer = cover.buffer;
    try { coverBuffer = await optimizeImage(cover.buffer, { maxWidth: 1600, enhance: true }); } catch (err) { console.error('[image optimize]', err); }
    const coverKey = objectKey('covers', cover.originalname);
    await storage.uploadBuffer(coverKey, coverBuffer, cover.mimetype);
    return storage.publicUrl(coverKey);
  })();

  // Only meaningful for courses, but not restricted to them at the DB
  // level — a free sample clip is a reasonable thing for any video
  // deliverable, not something worth a CHECK constraint over.
  const uploadPreview = previewVideo ? (async () => {
    const previewKey = objectKey('previews', previewVideo.originalname);
    await storage.uploadBuffer(previewKey, previewVideo.buffer, previewVideo.mimetype);
    return storage.publicUrl(previewKey);
  })() : Promise.resolve(null);

  // The main deliverable's R2 upload doesn't actually need productId —
  // only the product_files row it feeds does — so it can run alongside
  // the two above instead of waiting for the INSERT below.
  const uploadFile = file ? (async () => {
    const fileKey = objectKey('product-files', file.originalname);
    await storage.uploadBuffer(fileKey, file.buffer, file.mimetype);
    return fileKey;
  })() : Promise.resolve(null);

  const [coverPath, previewVideoPath, fileKey] = await Promise.all([uploadCover, uploadPreview, uploadFile]);

  const slug = slugify(title);
  const productCurrency = ['USD', 'ZWG'].includes(currency) ? currency : 'USD';
  const qtyLimit = quantity_limit ? parseInt(quantity_limit, 10) : null;
  const productStatus = status === 'draft' ? 'draft' : 'published';
  const deliveryDays = isService && delivery_days ? parseInt(delivery_days, 10) : null;

  const result = db.prepare(`
    INSERT INTO products
      (creator_id, title, description, type, category, price_minor, currency, pay_what_you_want,
       min_price_minor, quantity_limit, status, cover_path, slug, portfolio_url, delivery_days, service_terms,
       preview_video_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.creator.id, title, description || null, type, category,
    isPWYW ? (minPriceMinor || 0) : priceMinor, productCurrency, isPWYW ? 1 : 0,
    minPriceMinor, qtyLimit, productStatus, coverPath, slug,
    isService ? (portfolio_url || null) : null, deliveryDays,
    isService ? (service_terms || null) : null, previewVideoPath
  );

  const productId = result.lastInsertRowid;

  if (file) {
    // Private object — stored as just its R2 key, not a public URL. The
    // only way back to these bytes is routes/downloads.js minting a
    // short-lived presigned URL after checking a valid, unexpired,
    // not-over-its-download-limit token, exactly like it checked a local
    // file existed before this migration. (Upload itself already
    // happened above, in parallel with the cover/preview uploads.)
    db.prepare(`
      INSERT INTO product_files (product_id, kind, storage_path, original_filename, size_bytes)
      VALUES (?, 'upload', ?, ?, ?)
    `).run(productId, fileKey, file.originalname, file.size);
    // Fire-and-forget, deliberately not awaited: verification (hashing
    // the whole file, PDF page-counting) is real work with nothing in
    // this response depending on its result — it already wasn't allowed
    // to fail the request (see the catch below), so there's no reason to
    // make the seller sit through it too. Same "not critical enough to
    // block on" logic, just applied to speed as well as failure.
    verifyAndRecordFile(productId, req.creator.id, file, title, description)
      .catch(err => console.error('[content verification]', err));
  } else if (external_url) {
    db.prepare(`
      INSERT INTO product_files (product_id, kind, external_url)
      VALUES (?, 'external_link', ?)
    `).run(productId, external_url);
  }
  // Not exclusive with a file — a creator can ship a manual/installer as the
  // file and still have each sale claim its own key from this batch.
  if (keyList.length > 0) addKeys(productId, keyList);

  if (productStatus === 'published') checkAndUpdateVerification(req.creator.id);

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  res.status(201).json(withPromo(product));
});

// PATCH /api/products/:id — edit, publish, or unpublish. Owner only.
router.patch('/:id', requireAuth, requireCreator, upload.fields([
  { name: 'cover', maxCount: 1 },
  { name: 'file', maxCount: 1 },
  { name: 'preview_video', maxCount: 1 }
]), async (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  if (product.creator_id !== req.creator.id) {
    return res.status(403).json({ error: "You don't own this product." });
  }

  const {
    title, description, price, currency, pay_what_you_want, min_price,
    status, quantity_limit, category, external_url, discount_percent, discount_limit,
    portfolio_url, delivery_days, service_terms
  } = req.body;
  const cover = req.files?.cover?.[0];
  const file = req.files?.file?.[0];
  const previewVideo = req.files?.preview_video?.[0];
  const isService = product.type === 'service';

  const deliverableError = checkDeliverableType(file, category !== undefined ? category : product.category);
  if (deliverableError) return res.status(400).json({ error: deliverableError });
  if (previewVideo && !VIDEO_TYPES.has(previewVideo.mimetype)) {
    return res.status(400).json({ error: 'The free preview clip must be a video (MP4, WebM, or MOV).' });
  }
  if ((cover || file || previewVideo) && !storage.isConfigured()) {
    return res.status(503).json({ error: 'File storage is not configured yet. Try again shortly.' });
  }

  const isPWYW = pay_what_you_want !== undefined
    ? (pay_what_you_want === 'true' || pay_what_you_want === true)
    : !!product.pay_what_you_want;
  let priceMinor = product.price_minor;
  let minPriceMinor = product.min_price_minor;
  if (isPWYW) {
    if (min_price !== undefined) {
      minPriceMinor = toMinor(min_price) ?? 0;
      if (minPriceMinor < 0) return res.status(400).json({ error: 'min_price must be zero or a positive number.' });
    }
    priceMinor = minPriceMinor || 0;
  } else if (price !== undefined) {
    priceMinor = toMinor(price);
    if (priceMinor === null || priceMinor <= 0) return res.status(400).json({ error: 'price must be a positive number.' });
  }
  const productCurrency = currency !== undefined
    ? (['USD', 'ZWG'].includes(currency) ? currency : product.currency)
    : product.currency;

  if (category !== undefined && !CATEGORY_VALUES.includes(category)) {
    return res.status(400).json({ error: 'category must be a recognized category.' });
  }
  if (EBOOKS_ONLY && category !== undefined && category !== product.category && !ACTIVE_CATEGORY_VALUES.includes(category)) {
    return res.status(400).json({ error: 'Only ebooks, guides & templates, and courses are open for new listings right now.' });
  }

  // Promotions: changing the percentage starts a fresh promo (claim count
  // resets); adjusting only the buyer limit on an unchanged percentage is
  // an "extend" and keeps the existing claim count.
  let discountPercent = product.discount_percent;
  let discountLimit = product.discount_limit;
  let discountClaimed = product.discount_claimed;

  if (discount_percent !== undefined) {
    if (discount_percent === '' || discount_percent === null) {
      discountPercent = null;
      discountLimit = null;
      discountClaimed = 0;
    } else {
      const pct = parseInt(discount_percent, 10);
      if (!Number.isInteger(pct) || pct < 1 || pct > 90) {
        return res.status(400).json({ error: 'A promotion discount must be a whole number between 1 and 90.' });
      }
      const isNewPromo = pct !== product.discount_percent;
      discountPercent = pct;
      discountClaimed = isNewPromo ? 0 : product.discount_claimed;

      if (discount_limit === '' || discount_limit === undefined || discount_limit === null) {
        discountLimit = null;
      } else {
        const lim = parseInt(discount_limit, 10);
        if (!Number.isInteger(lim) || lim < 1) {
          return res.status(400).json({ error: 'The buyer limit must be a positive whole number, or left blank for unlimited.' });
        }
        if (lim < discountClaimed) {
          return res.status(400).json({ error: `The buyer limit can't be lower than the ${discountClaimed} buyers who've already claimed this promo.` });
        }
        discountLimit = lim;
      }
    }
  }

  const willPublish = status === 'published';
  if (willPublish && !isService) {
    const willHaveFile = file || external_url || db.prepare('SELECT 1 FROM product_files WHERE product_id = ?').get(product.id);
    const willHaveKeys = keyStats(product.id).total > 0;
    if (!willHaveFile && !willHaveKeys) {
      return res.status(400).json({ error: 'Attach a file, an external link, or add license keys before publishing. Buyers need something to actually receive.' });
    }
  }

  // All validation above has passed — only now do the actual R2 uploads.
  // Same reasoning as the POST handler above: whichever of these are
  // actually present are independent of each other, so they run
  // concurrently rather than one-after-another.
  const uploadCover = cover ? (async () => {
    let coverBuffer = cover.buffer;
    try { coverBuffer = await optimizeImage(cover.buffer, { maxWidth: 1600, enhance: true }); } catch (err) { console.error('[image optimize]', err); }
    const coverKey = objectKey('covers', cover.originalname);
    await storage.uploadBuffer(coverKey, coverBuffer, cover.mimetype);
    return storage.publicUrl(coverKey);
  })() : Promise.resolve(product.cover_path);

  const uploadPreview = previewVideo ? (async () => {
    const previewKey = objectKey('previews', previewVideo.originalname);
    await storage.uploadBuffer(previewKey, previewVideo.buffer, previewVideo.mimetype);
    return storage.publicUrl(previewKey);
  })() : Promise.resolve(product.preview_video_path);

  // The main deliverable's R2 upload doesn't need anything the DELETE/
  // INSERT below does, so it runs alongside cover/preview too instead of
  // waiting its turn.
  const uploadFile = file ? (async () => {
    const fileKey = objectKey('product-files', file.originalname);
    await storage.uploadBuffer(fileKey, file.buffer, file.mimetype);
    return fileKey;
  })() : Promise.resolve(null);

  const [coverPath, previewVideoPath, fileKey] = await Promise.all([uploadCover, uploadPreview, uploadFile]);

  db.prepare(`
    UPDATE products SET
      title = ?, description = ?, price_minor = ?, currency = ?, pay_what_you_want = ?, min_price_minor = ?,
      status = ?, quantity_limit = ?, cover_path = ?, category = ?,
      discount_percent = ?, discount_limit = ?, discount_claimed = ?,
      portfolio_url = ?, delivery_days = ?, service_terms = ?, preview_video_path = ?
    WHERE id = ?
  `).run(
    title ?? product.title,
    description ?? product.description,
    priceMinor,
    productCurrency,
    isPWYW ? 1 : 0,
    isPWYW ? minPriceMinor : null,
    status === 'draft' || status === 'published' ? status : product.status,
    quantity_limit !== undefined ? (quantity_limit ? parseInt(quantity_limit, 10) : null) : product.quantity_limit,
    coverPath,
    category !== undefined ? category : product.category,
    discountPercent, discountLimit, discountClaimed,
    isService ? (portfolio_url !== undefined ? portfolio_url : product.portfolio_url) : product.portfolio_url,
    isService && delivery_days !== undefined ? (delivery_days ? parseInt(delivery_days, 10) : null) : product.delivery_days,
    isService ? (service_terms !== undefined ? service_terms : product.service_terms) : product.service_terms,
    previewVideoPath,
    product.id
  );

  // A new file or link replaces the old deliverable outright — one file per
  // product (see getProductFile), so the old row is cleared first.
  if (file || external_url) {
    db.prepare('DELETE FROM product_files WHERE product_id = ?').run(product.id);
    if (file) {
      // Upload itself already happened above, in parallel with cover/
      // preview — fileKey is that result.
      db.prepare(`
        INSERT INTO product_files (product_id, kind, storage_path, original_filename, size_bytes)
        VALUES (?, 'upload', ?, ?, ?)
      `).run(product.id, fileKey, file.originalname, file.size);
      // A replaced file is a genuinely new upload, worth re-checking —
      // review_status resets to 'clear' first so an old flag from a
      // previous file doesn't linger on a file that's since been swapped out.
      db.prepare("UPDATE products SET review_status = 'clear', flag_reason = NULL WHERE id = ?").run(product.id);
      // Fire-and-forget — see the identical comment in the POST handler
      // above. Nothing in this response depends on verification finishing.
      verifyAndRecordFile(product.id, req.creator.id, file, title ?? product.title, description ?? product.description)
        .catch(err => console.error('[content verification]', err));
    } else {
      db.prepare(`
        INSERT INTO product_files (product_id, kind, external_url)
        VALUES (?, 'external_link', ?)
      `).run(product.id, external_url);
    }
  }

  if (status === 'published') checkAndUpdateVerification(req.creator.id);

  res.json(withPromo(db.prepare('SELECT * FROM products WHERE id = ?').get(product.id)));
});

// DELETE /api/products/:id — owner only, and only if it's never had an
// order placed against it. A product with purchase history can't be hard
// deleted: buyers' order history joins straight to the products table (see
// GET /api/purchases/mine), so removing the row would silently erase their
// receipt and access. Unpublish (PATCH status='draft') is the right move
// for a product that's already sold — this is only for a listing that was
// never actually bought.
router.delete('/:id', requireAuth, requireCreator, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  if (product.creator_id !== req.creator.id) {
    return res.status(403).json({ error: "You don't own this product." });
  }

  const hasPurchases = !!db.prepare('SELECT 1 FROM purchases WHERE product_id = ?').get(product.id);
  if (hasPurchases) {
    return res.status(409).json({
      error: 'This product has orders against it and can\'t be deleted. Set it to draft instead to take it down while keeping order history intact.'
    });
  }

  db.prepare('DELETE FROM products WHERE id = ?').run(product.id);
  res.json({ ok: true });
});

// POST /api/products/:id/license-keys — owner only. Additive: tops up
// stock rather than replacing it, so pasting a fresh batch later never
// disturbs keys already claimed by past buyers.
router.post('/:id/license-keys', requireAuth, requireCreator, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  if (product.creator_id !== req.creator.id) {
    return res.status(403).json({ error: "You don't own this product." });
  }

  const keyList = parseKeyList(req.body.license_keys);
  if (keyList.length === 0) {
    return res.status(400).json({ error: 'Paste at least one key, one per line.' });
  }

  addKeys(product.id, keyList);
  res.status(201).json({ added: keyList.length, ...keyStats(product.id) });
});

module.exports = router;
