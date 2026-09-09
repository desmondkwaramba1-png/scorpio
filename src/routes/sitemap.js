// Real sitemap, generated from the live database — every published
// product and every creator with at least one published listing, not a
// hand-maintained static file that goes stale the moment a new product
// ships. Mounted at the actual domain root (see server.js and
// client/vercel.json's dedicated rewrite for /sitemap.xml), not under
// /api, since that's where search engines expect to find it.
const express = require('express');
const db = require('../db/schema');

const router = express.Router();
const SITE_ORIGIN = (process.env.FRONTEND_URL || 'https://scorpio.co.zw').replace(/\/$/, '');

function xmlEscape(s) {
  return String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' }[c]));
}

router.get('/sitemap.xml', (req, res) => {
  const staticUrls = ['/', '/discover', '/creators', '/terms'];

  const creators = db.prepare(`
    SELECT DISTINCT c.handle FROM creators c
    JOIN products p ON p.creator_id = c.id AND p.status = 'published'
  `).all();

  const products = db.prepare(`
    SELECT p.slug, p.created_at, c.handle
    FROM products p JOIN creators c ON c.id = p.creator_id
    WHERE p.status = 'published'
  `).all();

  const urls = [
    ...staticUrls.map(path => ({ loc: `${SITE_ORIGIN}${path}`, priority: path === '/' ? '1.0' : '0.7' })),
    ...creators.map(c => ({ loc: `${SITE_ORIGIN}/@${c.handle}`, priority: '0.6' })),
    ...products.map(p => ({
      loc: `${SITE_ORIGIN}/@${p.handle}/${p.slug}`,
      lastmod: p.created_at ? p.created_at.replace(' ', 'T') + 'Z' : undefined,
      priority: '0.8'
    }))
  ];

  const body = urls.map(u => {
    const lastmodLine = u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : '';
    return `  <url>\n    <loc>${xmlEscape(u.loc)}</loc>${lastmodLine}\n    <priority>${u.priority}</priority>\n  </url>`;
  }).join('\n');

  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`
  );
});

module.exports = router;
