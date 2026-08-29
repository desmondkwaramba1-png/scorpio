const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const db = require('./schema');
const { checkAndUpdateVerification } = require('../lib/verification');
const { UPLOADS_DIR } = require('../lib/paths');

db.exec('DELETE FROM purchases');
db.exec('DELETE FROM product_files');
db.exec('DELETE FROM issues');
db.exec('DELETE FROM products');
db.exec('DELETE FROM creators');
db.exec('DELETE FROM sessions');
db.exec('DELETE FROM password_reset_tokens');
db.exec('DELETE FROM email_verification_tokens');
db.exec('DELETE FROM otp_codes');
db.exec('DELETE FROM users');
db.exec('DELETE FROM buyers');

const DEV_PASSWORD = 'zimselar2026';
const passwordHash = bcrypt.hashSync(DEV_PASSWORD, 10);
const COVER = '/brand/cover.svg';

const insertUser = db.prepare(`
  INSERT INTO users (username, email, phone, password_hash, email_verified_at, terms_accepted_at, name)
  VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?)
`);
// verified starts false for everyone — checkAndUpdateVerification() decides
// it for real at the bottom of this script, from the same criteria the app
// uses in production. No creator here is verified by fiat.
const insertCreator = db.prepare(`
  INSERT INTO creators
    (user_id, handle, name, email, bio, what_selling, who_for, payout_ecocash_number, verified)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
`);
const insertProduct = db.prepare(`
  INSERT INTO products
    (creator_id, title, description, type, category, price_minor, currency, quantity_limit, status, cover_path, slug)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)
`);
// Every published product needs something to actually deliver — mirrors the
// file-or-external_url requirement enforced on POST /api/products.
const insertProductFile = db.prepare(`
  INSERT INTO product_files (product_id, kind, storage_path, original_filename, size_bytes)
  VALUES (?, 'upload', ?, ?, ?)
`);
function attachSeedFile(productId, filename, originalName, content) {
  const filePath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filePath, content);
  insertProductFile.run(productId, `/uploads/${filename}`, originalName, Buffer.byteLength(content));
}

// A real generated image at avatar_path, not a live-computed fallback
// letter — "Meet the creators" should show something that reads as an
// actual picture, not nine identical blank circles. Same gradient+initial
// approach as the product covers below, just square (the frontend's own
// border-radius:50% on the containing element is what makes it read as a
// circle, so the source image doesn't need to be one).
const updateCreatorAvatar = db.prepare('UPDATE creators SET avatar_path = ? WHERE id = ?');
function assignSeedAvatar(creatorId, name, hue) {
  const initial = name.trim().charAt(0).toUpperCase();
  const from = `hsl(${hue}, 62%, 50%)`;
  const to = `hsl(${(hue + 35) % 360}, 65%, 38%)`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="200" height="200" fill="url(#g)"/>
  <text x="100" y="100" font-family="Georgia, serif" font-size="90" font-weight="700"
    fill="rgba(255,255,255,.95)" text-anchor="middle" dominant-baseline="central">${initial}</text>
</svg>`;
  const filename = `seed-avatar-${creatorId}.svg`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), svg);
  updateCreatorAvatar.run(`/uploads/${filename}`, creatorId);
}

// 1. Pauline, a serial community newspaper. Meets every verification
// criterion, so she'll come out verified.
const paulineUserId = insertUser.run(
  'chitowncrossroads', 'pauline@example.com', '+263771234001', passwordHash, 'Pauline Inasho'
).lastInsertRowid;
const paulineId = insertCreator.run(
  paulineUserId, 'chitowncrossroads', 'Pauline Inasho C', 'pauline@example.com',
  'Chitungwiza-based journalist and publisher of Chi-Town Crossroads.',
  'A weekly community newspaper covering Chitungwiza.',
  'Residents and businesses in and around Chitungwiza who want real local news.',
  '0771234001'
).lastInsertRowid;
assignSeedAvatar(paulineId, 'Pauline Inasho', 200);

const newspaperId = insertProduct.run(
  paulineId, 'Chi-Town Crossroads',
  'Weekly community newspaper covering Chitungwiza: local news, economy, and community issues.',
  'serial', 'writing', 100, 'USD', null, COVER, 'chi-town-crossroads'
).lastInsertRowid;

db.prepare(`
  INSERT INTO issues (product_id, issue_number, title, file_path)
  VALUES (?, ?, ?, ?)
`).run(
  newspaperId, 1,
  "Vendors Sustain Zimbabwe's Economy Amid Rising Informal Trade",
  '/files/chi-town-crossroads/issue-1.pdf'
);
attachSeedFile(
  newspaperId, 'seed-chi-town-crossroads-issue1.pdf', 'chi-town-crossroads-issue1.pdf',
  "CHI-TOWN CROSSROADS: Issue 1\n\nVendors Sustain Zimbabwe's Economy Amid Rising Informal Trade\n\n" +
  'A weekly community newspaper covering Chitungwiza: local news, economy, and community issues.\n'
);

// 2. Tanaka, a single ebook/course. Deliberately missing a payout number,
// so this account genuinely fails one criterion and stays unverified —
// a real, not asserted, "not there yet" example.
const tanakaUserId = insertUser.run(
  'tanakateaches', 'tanaka@example.com', '+263772234002', passwordHash, 'Tanaka Moyo'
).lastInsertRowid;
const tanakaId = insertCreator.run(
  tanakaUserId, 'tanakateaches', 'Tanaka Moyo', 'tanaka@example.com',
  'Small business consultant in Harare teaching practical Excel skills.',
  'A downloadable Excel course for small business bookkeeping.',
  'Vendors and small business owners who need to track money without an accountant.',
  null
).lastInsertRowid;
assignSeedAvatar(tanakaId, 'Tanaka Moyo', 24);

const excelId = insertProduct.run(
  tanakaId, 'Excel for Small Business',
  'A practical guide to tracking stock, sales, and expenses in Excel, built for Zimbabwean small businesses.',
  'single', 'templates', 800, 'USD', null, COVER, 'excel-for-small-business'
).lastInsertRowid;
attachSeedFile(
  excelId, 'seed-excel-for-small-business.pdf', 'excel-for-small-business.pdf',
  'EXCEL FOR SMALL BUSINESS: Course Notes\n\n' +
  '1. Setting up a stock sheet\n2. Daily sales log and running totals\n' +
  '3. Tracking expenses against income\n4. Building a simple month-end summary\n'
);

// 3. Rudo, a limited-quantity event ticket. Also meets every criterion.
const rudoUserId = insertUser.run(
  'rudoevents', 'rudo@example.com', '+263773234003', passwordHash, 'Rudo Chikwira'
).lastInsertRowid;
const rudoId = insertCreator.run(
  rudoUserId, 'rudoevents', 'Rudo Chikwira', 'rudo@example.com',
  'Community organiser running monthly meetups for Harare founders.',
  'Tickets to the monthly Harare Startup Mixer.',
  'Founders, freelancers, and anyone building something in Harare.',
  '0773234003'
).lastInsertRowid;
assignSeedAvatar(rudoId, 'Rudo Chikwira', 280);

const ticketId = insertProduct.run(
  rudoId, 'Harare Startup Mixer, August',
  'An evening of demos, networking, and pizza for Harare\'s startup community. Limited to 50 tickets.',
  'single', 'business', 500, 'USD', 50, COVER, 'harare-startup-mixer-august'
).lastInsertRowid;
attachSeedFile(
  ticketId, 'seed-harare-startup-mixer-ticket.pdf', 'harare-startup-mixer-ticket.pdf',
  "HARARE STARTUP MIXER, August: Entry Ticket\n\n" +
  "An evening of demos, networking, and pizza for Harare's startup community.\n" +
  'Show this confirmation at the door. Limited to 50 tickets.\n'
);

const readerId = db.prepare('INSERT INTO buyers (name, email) VALUES (?, ?)').run('Test Reader', 'reader@example.com').lastInsertRowid;
const buyer2Id = db.prepare('INSERT INTO buyers (name, email) VALUES (?, ?)').run('Kuda M', 'kuda@example.com').lastInsertRowid;
const buyer3Id = db.prepare('INSERT INTO buyers (name, email) VALUES (?, ?)').run('Tino R', 'tino@example.com').lastInsertRowid;

const insertPurchase = db.prepare(`
  INSERT INTO purchases (buyer_id, product_id, amount_minor, currency, payment_reference, payment_status, created_at)
  VALUES (?, ?, ?, 'USD', ?, 'paid', datetime('now', ?))
`);
// A little purchase history so Insights and Wallet have real numbers to show.
insertPurchase.run(readerId, excelId, 800, 'STUB-SEED-1', '-6 days');
insertPurchase.run(buyer2Id, newspaperId, 100, 'STUB-SEED-2', '-4 days');
insertPurchase.run(buyer3Id, newspaperId, 100, 'STUB-SEED-3', '-2 days');
insertPurchase.run(readerId, newspaperId, 100, 'STUB-SEED-4', '-1 days');
insertPurchase.run(buyer2Id, ticketId, 500, 'STUB-SEED-5', '-3 days');

// Same function the app calls on a real purchase/publish/payout-add/email-
// verify event — seed data earns the Seal the same way a real account would.
checkAndUpdateVerification(paulineId);
checkAndUpdateVerification(tanakaId);
checkAndUpdateVerification(rudoId);

// ---- bulk catalog: 50 products across 6 creators, for browsing/testing at
// real marketplace scale rather than 3 hand-picked examples. Covers are
// generated SVGs (a gradient + the title's initial) instead of real photos
// — no network dependency, no external image source needed, and every one
// is visually distinct, which is the part that actually matters for
// browsing a grid. Deliverable files are the same honest text-stub pattern
// as the three products above, just named .pdf to match what the buy page
// actually shows ("Delivered as PDF") — real content, a seller would
// upload their real file at this same path.
function slugify(title, i) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + i;
}

function writeSeedCover(filename, title, hue) {
  const initial = title.trim().charAt(0).toUpperCase();
  const from = `hsl(${hue}, 58%, 46%)`;
  const to = `hsl(${(hue + 42) % 360}, 62%, 34%)`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="480" viewBox="0 0 600 480">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="600" height="480" fill="url(#g)"/>
  <text x="300" y="270" font-family="Georgia, serif" font-size="180" font-weight="700"
    fill="rgba(255,255,255,.92)" text-anchor="middle" dominant-baseline="middle">${initial}</text>
</svg>`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), svg);
  return `/uploads/${filename}`;
}

const CATALOG_CREATORS = [
  { handle: 'tendai_writes', name: 'Tendai Moyo', phone: '+263774001001',
    bio: 'Freelance writer and educator based in Bulawayo, focused on practical study guides.',
    what_selling: 'Study guides and educational ebooks for students and self-learners.',
    who_for: 'Students and self-learners who want clear, practical material.',
    products: [
      ['Learn Shona in 30 Days', 'ebooks', 6, 'A structured 30-day course to build real conversational Shona, not just vocabulary lists.'],
      ["The Freelance Writer's Handbook", 'ebooks', 9, 'How to find clients, price your work, and get paid on time as a freelance writer in Zimbabwe.'],
      ['How to Start a Blog That Actually Makes Money', 'ebooks', 8, 'The practical, unglamorous steps to turning a blog into real income.'],
      ["The Beginner's Guide to Public Speaking", 'ebooks', 5, 'Overcome nerves and structure a talk people actually remember.'],
      ['Mastering Email Writing for Work', 'ebooks', 4, 'Clear, professional email templates for every awkward work situation.'],
      ['The Complete Guide to Poultry Farming in Zimbabwe', 'ebooks', 10, 'Everything from housing to feed to market access, written for local conditions.'],
      ['Home Gardening for Beginners', 'ebooks', 5, 'Grow real food in a small urban yard, season by season.'],
      ['Nutrition Guide for New Mothers', 'ebooks', 7, 'Practical, affordable nutrition advice for the first year after birth.'],
      ["The Zimbabwean Entrepreneur's Handbook", 'ebooks', 12, 'What actually works when starting a business here, from someone who has done it.']
    ] },
  { handle: 'nyasha_plans', name: 'Nyasha Chikwanha', phone: '+263774002002',
    bio: 'Business consultant helping Zimbabwean entrepreneurs plan and launch.',
    what_selling: 'Business plan templates and startup guides.',
    who_for: 'Aspiring entrepreneurs and small business owners.',
    products: [
      ['30-Day Business Plan Template', 'templates', 10, 'A fill-in-the-blanks business plan you can actually finish in a month.'],
      ['Startup Pitch Deck Template', 'templates', 12, 'The slide-by-slide structure investors actually expect to see.'],
      ['Small Business Startup Checklist', 'templates', 6, 'Every registration, license, and setup step, in the right order.'],
      ['Import/Export Business Plan Template', 'templates', 15, 'A plan template built around cross-border trade specifically.'],
      ['Grant Proposal Template', 'templates', 9, 'A proposal structure that has actually won funding.'],
      ['Tuck Shop Business Plan Template', 'templates', 8, 'A realistic, small-capital plan template for a tuck shop or kiosk.'],
      ['Sales Pitch Deck Template', 'templates', 11, 'A clean deck template for pitching a product to a real buyer, not an investor.'],
      ['New Employee Onboarding Checklist', 'templates', 7, 'Everything a new hire needs on day one, so nothing gets forgotten.'],
      ['Freelance Contract Template Pack', 'templates', 6, 'Contracts that protect you and still feel fair to the client.']
    ] },
  { handle: 'farai_finance', name: 'Farai Ndlovu', phone: '+263774003003',
    bio: 'Personal finance coach in Harare teaching practical money management.',
    what_selling: 'Budgeting templates and personal finance ebooks.',
    who_for: 'Anyone who wants to get their money under control.',
    products: [
      ['Monthly Budget Tracker Template', 'templates', 5, 'A no-nonsense spreadsheet for tracking income and expenses every month.'],
      ['Debt Payoff Tracker Template', 'templates', 5, 'Visualize your debt shrinking, one payment at a time.'],
      ['Personal Finance Tracker Bundle', 'templates', 9, 'Budget, savings goals, and debt tracking in one bundle.'],
      ['A Beginner\'s Guide to Forex Trading', 'ebooks', 12, 'The honest basics, including the risks nobody puts in the ads.'],
      ['Crypto Basics for Zimbabweans', 'ebooks', 8, 'What crypto actually is, and how people here really use it.'],
      ['Understanding Zimbabwean Tax Law', 'ebooks', 10, 'A plain-language guide to what small businesses actually owe and when.'],
      ['Mastering Personal Budgeting', 'ebooks', 6, 'A simple system that survives real life, not just a spreadsheet template.'],
      ['The Side Hustle Starter Guide', 'ebooks', 7, 'Realistic side income ideas you can start this month with what you already have.']
    ] },
  { handle: 'rutendo_designs', name: 'Rutendo Mapfumo', phone: '+263774004004',
    bio: 'Template designer making practical tools for small businesses and creators.',
    what_selling: 'Resume templates, invoices, and business document packs.',
    who_for: 'Job seekers and small business owners who need professional documents fast.',
    products: [
      ['Professional Resume Template Pack', 'templates', 7, 'Five clean resume layouts that pass applicant tracking systems.'],
      ['CV & Cover Letter Template Pack', 'templates', 6, 'Matching CV and cover letter templates for a consistent application.'],
      ['Invoice Template Bundle', 'templates', 5, 'Professional invoices ready to send, in USD and ZiG.'],
      ['Content Creator Media Kit Template', 'templates', 8, 'A media kit template for pitching brand deals with real numbers.'],
      ['Rental Agreement Template (Zimbabwe)', 'templates', 6, 'A lease template written for local rental practice, not a US template pasted over.'],
      ['Social Media Content Calendar Template', 'templates', 7, 'Plan a month of posts across platforms without losing track.'],
      ['Church Event Planning Template', 'templates', 6, 'A planning template for services, conferences, and outreach events.'],
      ['Funeral Program Template', 'templates', 4, 'A respectful, easy-to-edit program template for a difficult time.']
    ] },
  { handle: 'tafadzwa_guides', name: 'Tafadzwa Sibanda', phone: '+263774005005',
    bio: 'Tutor and author of practical study guides for Zimbabwean students.',
    what_selling: 'Exam-focused study guides.',
    who_for: 'O-Level and A-Level students preparing for exams.',
    products: [
      ['Study Guide: A-Level Mathematics', 'ebooks', 9, 'Worked examples and past-paper technique, topic by topic.'],
      ['Study Guide: O-Level Combined Science', 'ebooks', 9, 'The exact syllabus areas that show up every year, explained simply.'],
      ["The Complete Real Estate Investor's Handbook", 'ebooks', 14, 'A first-principles guide to property investment in the local market.'],
      ['University Application Guide (Zimbabwe)', 'ebooks', 6, 'Deadlines, requirements, and how to actually stand out in an application.'],
      ['The Art of Negotiation', 'ebooks', 7, 'Practical tactics for negotiating price, salary, or terms, not theory.'],
      ['Time Management for Entrepreneurs', 'ebooks', 6, 'A system built for people whose days never look the same twice.'],
      ["Building Your First App: A Beginner's Guide", 'ebooks', 11, 'From idea to a working app, with no prior coding assumed.'],
      ["The Small Business Owner's Legal Guide", 'ebooks', 10, 'The legal basics every small business owner should know before trouble finds them.']
    ] },
  { handle: 'chido_events', name: 'Chido Marufu', phone: '+263774006006',
    bio: 'Event planner sharing practical checklists and planning templates.',
    what_selling: 'Event planning checklists and templates.',
    who_for: 'Anyone planning a wedding, party, or community event.',
    products: [
      ['Wedding Budget Spreadsheet Template', 'templates', 7, 'Track every wedding cost against your actual budget, category by category.'],
      ['Event Planning Checklist Template', 'templates', 5, 'A timeline checklist that starts at 6 months out and ends at the door.'],
      ['Baby Shower Planning Checklist', 'templates', 4, 'Everything to plan a baby shower without last-minute panic.'],
      ['Moving House Checklist Template', 'templates', 4, 'A room-by-room checklist so nothing gets left behind or forgotten.'],
      ['Meal Prep Planner Template', 'templates', 5, 'Plan a week of meals and the shopping list that goes with it.'],
      ['Home Workout Plan Template (8 Weeks)', 'templates', 6, 'A structured 8-week plan that needs no gym equipment.'],
      ['Job Application Tracker Template', 'templates', 4, 'Track every application, follow-up, and interview in one place.'],
      ['School Timetable Template', 'templates', 3, 'A clean, printable weekly timetable template for students.']
    ] }
];

let productIndex = 0;
let creatorIndex = 0;
let totalCatalogProducts = 0;
for (const c of CATALOG_CREATORS) {
  creatorIndex += 1;
  const email = `${c.handle}@example.com`;
  const userId = insertUser.run(c.handle, email, c.phone, passwordHash, c.name).lastInsertRowid;
  const creatorId = insertCreator.run(
    userId, c.handle, c.name, email, c.bio, c.what_selling, c.who_for, c.phone.replace('+263', '0')
  ).lastInsertRowid;
  assignSeedAvatar(creatorId, c.name, (creatorIndex * 61 + 10) % 360);

  for (const [title, category, priceUsd, description] of c.products) {
    productIndex += 1;
    const slug = slugify(title, productIndex);
    const hue = (productIndex * 47) % 360;
    const coverPath = writeSeedCover(`seed-cover-${slug}.svg`, title, hue);

    const productId = insertProduct.run(
      creatorId, title, description, 'single', category, priceUsd * 100, 'USD', null, coverPath, slug
    ).lastInsertRowid;

    attachSeedFile(
      productId, `seed-file-${slug}.pdf`, `${slug}.pdf`,
      `${title.toUpperCase()}\n\n${description}\n\n(Seed placeholder content. A real seller uploads their actual PDF here.)\n`
    );
  }
  checkAndUpdateVerification(creatorId);
  totalCatalogProducts += c.products.length;
}

const verifiedCount = db.prepare('SELECT COUNT(*) AS n FROM creators WHERE verified = 1').get().n;
const totalProducts = 3 + totalCatalogProducts;
console.log(`Seed complete: ${3 + CATALOG_CREATORS.length} creators (${verifiedCount} verified for real, by meeting the actual criteria), ${totalProducts} products, 3 buyers, sample purchases.`);
console.log(`Log in as any seeded creator with their username (chitowncrossroads / tanakateaches / rudoevents / ${CATALOG_CREATORS.map(c => c.handle).join(' / ')}) and password "${DEV_PASSWORD}".`);
