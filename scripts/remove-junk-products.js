/**
 * One-off: remove specific junk/test product listings by slug.
 * Safe by construction — refuses to touch a product that has any real
 * purchase against it, and only ever acts on the exact slugs listed below.
 *
 *   node scripts/remove-junk-products.js
 */
const db = require('../src/db/schema');

const SLUGS_TO_REMOVE = [
  '30-day-business-plan-325d', // duplicate of 30-day-business-plan-alc8
  'ndkdnxndjdmxn-25h9',        // gibberish test title
];

for (const slug of SLUGS_TO_REMOVE) {
  const product = db.prepare('SELECT id, title, creator_id FROM products WHERE slug = ?').get(slug);
  if (!product) { console.log(`skip: no product with slug "${slug}"`); continue; }

  const purchases = db.prepare('SELECT COUNT(*) n FROM purchases WHERE product_id = ?').get(product.id).n;
  if (purchases > 0) { console.log(`REFUSING to delete "${product.title}" (${slug}) — it has ${purchases} real purchase(s).`); continue; }

  db.transaction(() => {
    db.prepare('DELETE FROM product_files WHERE product_id = ?').run(product.id);
    db.prepare('DELETE FROM products WHERE id = ?').run(product.id);
  })();
  console.log(`Deleted "${product.title}" (${slug}).`);
}
