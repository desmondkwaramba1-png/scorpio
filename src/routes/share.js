// Link-preview (Open Graph / Twitter card) HTML for when a product or
// storefront link is pasted into WhatsApp, Facebook, Twitter, Slack,
// Discord, iMessage, etc. Those crawlers don't run JavaScript, so the
// SPA's runtime <meta> tags never reach them — Vercel rewrites requests
// with a known crawler user-agent to this route instead (see
// client/vercel.json), which returns a tiny document with the right tags
// baked in and an instant redirect for any human who lands here.
const express = require('express');
const db = require('../db/schema');

const router = express.Router();

const SITE = (process.env.FRONTEND_URL || 'https://www.scorpio.co.zw').replace(/\/$/, '');
const DEFAULT_IMAGE = `${SITE}/brand/og-default.png`;

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Social crawlers can't render SVG previews, and a relative path means
// nothing to them — fall back to the branded default card in both cases.
function ogImage(path) {
  if (!path || /\.svg($|\?)/i.test(path)) return DEFAULT_IMAGE;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE}${path.startsWith('/') ? '' : '/'}${path}`;
}

function money(minor, currency) {
  const n = (Number(minor || 0) / 100).toFixed(2);
  return currency === 'ZWG' ? `ZiG ${n}` : `US$ ${n}`;
}

function truncate(s, n = 200) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

function render({ title, description, image, url, type = 'website' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:site_name" content="SCORPIO">
<meta property="og:type" content="${esc(type)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta name="theme-color" content="#131921">
<meta http-equiv="refresh" content="0; url=${esc(url)}">
<script>window.location.replace(${JSON.stringify(url)});</script>
</head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#131921;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center">
<p style="text-align:center">Opening on SCORPIO&hellip;<br><a style="color:#FF8C42" href="${esc(url)}">Continue</a></p>
</body>
</html>`;
}

// Everything under /share/* — the path after /share is the real site path
// the crawler asked for, e.g. /share/@handle/slug.
router.get('*', (req, res) => {
  const path = req.path.replace(/^\/+/, '').replace(/\/+$/, '');
  res.type('html');

  // Product: @handle/slug
  const product = path.match(/^@([a-z0-9][a-z0-9_-]*)\/([a-z0-9][a-z0-9_-]*)$/i);
  if (product) {
    const row = db.prepare(`
      SELECT p.title, p.description, p.cover_path, p.price_minor, p.currency, p.slug,
             c.handle, c.name
      FROM products p JOIN creators c ON c.id = p.creator_id
      WHERE c.handle = ? AND p.slug = ? AND p.status = 'published'
    `).get(product[1], product[2]);
    if (row) {
      return res.send(render({
        title: `${row.title}, ${money(row.price_minor, row.currency)} · SCORPIO`,
        description: truncate(row.description || `${row.title}, from ${row.name} on SCORPIO. Pay instantly with EcoCash.`),
        image: ogImage(row.cover_path),
        url: `${SITE}/@${row.handle}/${row.slug}`,
        type: 'product',
      }));
    }
  }

  // Blog post: blog/slug
  const post = path.match(/^blog\/([a-z0-9][a-z0-9-]*)$/i);
  if (post) {
    const row = db.prepare(`
      SELECT bp.title, bp.excerpt, bp.cover_path, bp.slug, bp.author_name, c.handle
      FROM blog_posts bp LEFT JOIN creators c ON c.id = bp.creator_id
      WHERE bp.slug = ? AND bp.status = 'published' AND bp.published_at <= datetime('now')
    `).get(post[1]);
    if (row) {
      return res.send(render({
        title: `${row.title} · SCORPIO Blog`,
        description: truncate(row.excerpt || `A guide from ${row.handle ? '@' + row.handle : row.author_name} on the SCORPIO blog.`),
        image: ogImage(row.cover_path),
        url: `${SITE}/blog/${row.slug}`,
        type: 'article',
      }));
    }
  }

  // Storefront: @handle
  const store = path.match(/^@([a-z0-9][a-z0-9_-]*)$/i);
  if (store) {
    const c = db.prepare('SELECT handle, name, bio, avatar_path FROM creators WHERE handle = ?').get(store[1]);
    if (c) {
      return res.send(render({
        title: `${c.name} · SCORPIO`,
        description: truncate(c.bio || `${c.name}'s storefront on SCORPIO, digital products from a real Zimbabwean creator, paid with EcoCash.`),
        image: ogImage(c.avatar_path),
        url: `${SITE}/@${c.handle}`,
        type: 'profile',
      }));
    }
  }

  // Anything else (homepage, /discover, a dead link) — generic branded card.
  return res.send(render({
    title: "SCORPIO, Zimbabwe's Marketplace for Ebooks, Courses & Templates",
    description: 'Buy ebooks, guides, templates and online courses from real Zimbabwean creators, pay instantly with EcoCash. Or open your own storefront in five minutes.',
    image: DEFAULT_IMAGE,
    url: path ? `${SITE}/${path}` : SITE,
  }));
});

module.exports = router;
