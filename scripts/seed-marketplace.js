/**
 * Seed the live marketplace with demo creators + products so it doesn't
 * look empty at launch.
 *
 *   node scripts/seed-marketplace.js           # add demo data (skips if already seeded)
 *   node scripts/seed-marketplace.js --fresh   # remove previous demo data first, then reseed
 *   node scripts/seed-marketplace.js --remove  # remove all demo data and stop
 *
 * Demo rows are namespaced: every creator gets a handle starting "demo-"
 * and its user an email ending "@demo.scorpio.co.zw", so --fresh can find
 * and remove exactly what this script created and nothing else. Real
 * accounts and real products are never touched.
 *
 * Demo products are real, published, and buyable — covers are the committed
 * gradient set under /brand/seed/, and the download redirects to a real
 * sample PDF. A buyer of a demo product gets that PDF.
 *
 * For local and staging data only: it refuses to add data when NODE_ENV is
 * production. --remove still works there, to clean up. Each run generates its
 * own password, and demo sellers get no payout number, so nobody can log in
 * with a known password and no money can be sent to a made-up number.
 */

const { randomBytes } = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../src/db/schema');
const { checkAndUpdateVerification } = require('../src/lib/verification');

const TARGET_PRODUCTS = Number(process.env.SEED_COUNT || 200);
const NUM_CREATORS = 24;
const COVERS = Array.from({ length: 24 }, (_, i) => `/brand/seed/cover-${i + 1}.png`);
const SAMPLE_FILE = 'https://www.scorpio.co.zw/brand/seed/sample-guide.pdf';
const PASSWORD = randomBytes(18).toString('base64url');
const DEMO_EMAIL_DOMAIN = '@demo.scorpio.co.zw';

const FIRST = ['Tendai', 'Rutendo', 'Farai', 'Nyasha', 'Tapiwa', 'Chipo', 'Kudzai', 'Tafara', 'Rumbidzai', 'Simba', 'Panashe', 'Tinashe', 'Ropafadzo', 'Munashe', 'Anesu', 'Takudzwa', 'Vimbai', 'Batsirai', 'Shamiso', 'Tanaka', 'Fadzai', 'Wadzanai', 'Blessing', 'Prosper'];
const LAST = ['Moyo', 'Ncube', 'Dube', 'Sibanda', 'Mpofu', 'Chikwanha', 'Marufu', 'Mapfumo', 'Ndlovu', 'Gumbo', 'Chirwa', 'Mutasa', 'Nyathi', 'Zhou', 'Chidziva', 'Makoni', 'Muchena', 'Rusike', 'Bere', 'Kambeu'];

const BIOS = [
  'Writer and small-business coach based in Harare.',
  'Chartered accountant helping SMEs get their books right.',
  'Full-time freelancer sharing what actually worked.',
  'Ex-banker, now teaching personal finance in plain language.',
  'Agronomist writing practical guides for smallholder farmers.',
  'Designer and templates maker. Bulawayo.',
  'Teacher building study resources for O and A level students.',
  'Runs a tuck shop and a YouTube channel about running a tuck shop.',
  'Marketing consultant for Zimbabwean brands.',
  'Software developer and part-time course creator.',
];

const TITLES = {
  ebooks: [
    'Learn Shona in 30 Days', "The Zimbabwean Entrepreneur's Handbook", 'Understanding Zimbabwean Tax Law',
    "A Beginner's Guide to Forex Trading", 'Crypto Basics for Zimbabweans', 'The Side Hustle Starter Guide',
    'Home Gardening for Beginners', 'Nutrition Guide for New Mothers', 'The Art of Negotiation',
    'Building Your First App', 'Public Speaking Without Fear', 'Personal Finance for Young Zimbabweans',
    'The Complete Guide to Poultry Farming', "The Real Estate Investor's Handbook", 'Email Writing for Work',
    'Time Management for Entrepreneurs', 'How to Start a Blog That Makes Money', 'The Freelance Writing Playbook',
    'Selling on WhatsApp: A Practical Guide', 'From Employee to Business Owner',
    'The Beginner Guide to Stokvels and Savings Groups', 'Grow Your First 1,000 Followers',
    'Budgeting on an Irregular Income', 'Import and Resell: A Starter Guide',
  ],
  templates: [
    '30-Day Business Plan Template', 'Startup Pitch Deck Template', 'Monthly Budget Tracker',
    'Freelance Contract Template Pack', 'Invoice Template Bundle', 'Rental Agreement Template (Zimbabwe)',
    'CV and Cover Letter Template Pack', 'Social Media Content Calendar', 'Wedding Budget Spreadsheet',
    'Event Planning Checklist', 'Grant Proposal Template', 'Tuck Shop Business Plan Template',
    'Debt Payoff Tracker', 'New Employee Onboarding Checklist', 'Import/Export Business Plan Template',
    'Sales Pitch Deck Template', 'Personal Finance Tracker Bundle', 'Moving House Checklist',
    'Meal Prep Planner', '8-Week Home Workout Plan', 'Church Event Planning Template',
    'Funeral Program Template', 'Job Application Tracker', 'Content Creator Media Kit Template',
  ],
  courses: [
    'Excel for Small Business', 'Bookkeeping Basics: A Video Course', 'Instagram Growth for Zimbabwean Brands',
    'Photography with Just Your Phone', 'Baking to Sell: A Practical Course', 'Intro to Graphic Design with Canva',
    'WhatsApp Business Masterclass', 'Public Speaking Bootcamp', 'Freelance Writing: From Zero to First Client',
    'Facebook Ads for Local Businesses', 'Build a Website With No Code', 'Personal Branding for Job Seekers',
    'Digital Marketing Fundamentals', 'Video Editing on Your Phone', 'Selling Digital Products 101',
    'Customer Service That Keeps People Coming Back', 'Pricing Your Work Without Underselling',
    'Getting Started With Dropshipping in Zimbabwe',
  ],
};

const EDITIONS = ['', '', '', ' (2026 Edition)', ' — Extended', ' Vol. 2', ' — Harare Edition', ' — Practical Workbook', ' for Beginners', ' — Quick Start'];

function slugify(t) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).slice(2, 6);
}
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function rint(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }

const existingDemo = db.prepare(`SELECT COUNT(*) n FROM creators WHERE handle LIKE 'demo-%'`).get().n;
const REMOVE = process.argv.includes('--remove');
const FRESH = process.argv.includes('--fresh');

function removeDemoData() {
  const ids = db.prepare(`SELECT id, user_id FROM creators WHERE handle LIKE 'demo-%'`).all();
  db.transaction(() => {
    for (const { id, user_id } of ids) {
      db.prepare('DELETE FROM products WHERE creator_id = ?').run(id); // cascades product_files
      db.prepare('DELETE FROM creators WHERE id = ?').run(id);
      if (user_id) db.prepare('DELETE FROM users WHERE id = ?').run(user_id);
    }
  })();
  return ids.length;
}

if (REMOVE) {
  const n = removeDemoData();
  const left = db.prepare(`SELECT COUNT(*) n FROM products WHERE status = 'published'`).get().n;
  console.log(`Removed ${n} demo creators and their products. ${left} published products remain.`);
  process.exit(0);
}

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to add demo data to production. Use --remove to clean up.');
  process.exit(1);
}

if (FRESH && existingDemo) {
  console.log(`Removed ${removeDemoData()} previous demo creators and their products.`);
} else if (existingDemo) {
  console.log(`Demo data already present (${existingDemo} demo creators). Use --fresh to rebuild. Nothing to do.`);
  process.exit(0);
}

const passwordHash = bcrypt.hashSync(PASSWORD, 10);
const insertUser = db.prepare(`
  INSERT INTO users (username, email, phone, password_hash, email_verified_at, terms_accepted_at, name)
  VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?)
`);
const insertCreator = db.prepare(`
  INSERT INTO creators (user_id, handle, name, email, bio, what_selling, who_for, avatar_path, payout_ecocash_number, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-' || ? || ' days'))
`);
const insertProduct = db.prepare(`
  INSERT INTO products (creator_id, title, description, type, price_minor, currency, status, cover_path, slug, category, created_at)
  VALUES (?, ?, ?, 'single', ?, 'USD', 'published', ?, ?, ?, datetime('now', '-' || ? || ' days'))
`);
const insertFile = db.prepare(`INSERT INTO product_files (product_id, kind, external_url) VALUES (?, 'external_link', ?)`);

const usedSlugs = new Set(db.prepare('SELECT slug FROM products WHERE slug IS NOT NULL').all().map(r => r.slug));
function uniqueSlug(title) {
  let s = slugify(title);
  while (usedSlugs.has(s)) s = slugify(title);
  usedSlugs.add(s);
  return s;
}

const CATS = Object.keys(TITLES);
let productsMade = 0;

const run = db.transaction(() => {
  for (let c = 0; c < NUM_CREATORS && productsMade < TARGET_PRODUCTS; c++) {
    const first = FIRST[c % FIRST.length];
    const last = pick(LAST);
    const name = `${first} ${last}`;
    const handleBase = `demo-${first.toLowerCase()}-${last[0].toLowerCase()}`;
    let handle = handleBase, n = 1;
    while (db.prepare('SELECT 1 FROM creators WHERE handle = ?').get(handle)) handle = `${handleBase}${++n}`;

    const ures = insertUser.run(
      handle.replace(/-/g, '_'),
      `${handle}${DEMO_EMAIL_DOMAIN}`,
      `+2637${rint(70, 78)}${rint(1000000, 9999999)}`,
      passwordHash,
      name
    );
    const bio = pick(BIOS);
    const cres = insertCreator.run(
      ures.lastInsertRowid, handle, name, `${handle}${DEMO_EMAIL_DOMAIN}`, bio,
      'Practical digital guides, templates and short courses.',
      'Zimbabweans starting or running a small business or side hustle.',
      COVERS[c % COVERS.length], null,
      rint(5, 120)
    );
    const creatorId = cres.lastInsertRowid;

    const perCreator = Math.ceil((TARGET_PRODUCTS - productsMade) / (NUM_CREATORS - c));
    for (let p = 0; p < perCreator && productsMade < TARGET_PRODUCTS; p++) {
      const cat = CATS[(c + p) % CATS.length];
      const title = pick(TITLES[cat]) + pick(EDITIONS);
      const price = pick([3, 3, 5, 5, 5, 7, 8, 10, 10, 12, 15, 15, 18, 20, 25, 29]) * 100;
      const daysAgo = rint(1, 150);
      const desc = `${title}. A practical, ready-to-use ${cat === 'courses' ? 'short course' : cat === 'templates' ? 'template pack' : 'guide'} from ${name}. Written for a Zimbabwean audience, no fluff. Instant download after payment.`;
      const slug = uniqueSlug(title);
      const pres = insertProduct.run(
        creatorId, title, desc, price,
        COVERS[(c * 7 + p * 3) % COVERS.length], slug, cat, daysAgo
      );
      insertFile.run(pres.lastInsertRowid, SAMPLE_FILE);
      productsMade++;
    }

    checkAndUpdateVerification(creatorId);
  }
});

run();

const totalPub = db.prepare(`SELECT COUNT(*) n FROM products WHERE status = 'published'`).get().n;
const totalCreators = db.prepare(`SELECT COUNT(*) n FROM creators`).get().n;
console.log(`Seeded ${productsMade} demo products across ${NUM_CREATORS} demo creators.`);
console.log(`Marketplace now: ${totalPub} published products, ${totalCreators} creators total.`);
console.log(`Demo login: any demo creator email + password "${PASSWORD}"`);
