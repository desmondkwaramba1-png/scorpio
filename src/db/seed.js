```js
/**
 * ZIMSELAR FULL MARKETPLACE SEED
 *
 * Creates:
 *   200 creators
 *   1,000 products (5 per creator)
 *   250 buyers
 *   3,500 purchases
 *   engagement, reviews, posts, reels, services, carts and issues
 *
 * All seeded accounts:
 *   password = zimselar2026
 *
 * The seed is schema-aware: optional tables such as payouts/reports
 * are only used if they actually exist.
 */

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const DB_PATH =
  process.env.DB_PATH ||
  path.join(__dirname, "zimselar.db");

console.log("Seeding database: " + DB_PATH);

if (!fs.existsSync(DB_PATH)) {
  throw new Error("Database not found: " + DB_PATH);
}

const db = new Database(DB_PATH);

db.pragma("foreign_keys = OFF");

/* =========================================================
   DATABASE HELPERS
   ========================================================= */

const tables = new Set(
  db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
  `).all().map(row => row.name)
);

function hasTable(name) {
  return tables.has(name);
}

const columnCache = new Map();

function getColumns(table) {
  if (!hasTable(table)) return [];

  if (!columnCache.has(table)) {
    columnCache.set(
      table,
      new Set(
        db.prepare(`PRAGMA table_info("${table}")`)
          .all()
          .map(row => row.name)
      )
    );
  }

  return columnCache.get(table);
}

function hasColumn(table, column) {
  return getColumns(table).has(column);
}

function insertDynamic(table, data) {
  if (!hasTable(table)) return null;

  const usable = {};

  for (const [key, value] of Object.entries(data)) {
    if (hasColumn(table, key) && value !== undefined) {
      usable[key] = value;
    }
  }

  const keys = Object.keys(usable);

  if (!keys.length) return null;

  const sql = `
    INSERT INTO "${table}"
    (${keys.map(k => `"${k}"`).join(", ")})
    VALUES
    (${keys.map(k => `@${k}`).join(", ")})
  `;

  const result = db.prepare(sql).run(usable);

  return Number(result.lastInsertRowid);
}

function clearTable(table) {
  if (hasTable(table)) {
    db.prepare(`DELETE FROM "${table}"`).run();
  }
}

function pick(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedPick(items) {
  const total = items.reduce(
    (sum, item) => sum + item.weight,
    0
  );

  let n = Math.random() * total;

  for (const item of items) {
    n -= item.weight;

    if (n <= 0) {
      return item.value;
    }
  }

  return items[items.length - 1].value;
}

function cleanUsername(value) {
  return value
    .replace(/[^A-Za-z0-9_]/g, "")
    .toLowerCase();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function daysAgo(maxDays) {
  const date = new Date(
    Date.now() -
    rand(0, maxDays) * 24 * 60 * 60 * 1000
  );

  return date.toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

/* =========================================================
   SOURCE DATA
   ========================================================= */

const firstNames = [
  "Tendai",
  "Nyasha",
  "Rutendo",
  "Farai",
  "Chido",
  "Tanaka",
  "Rudo",
  "Tafadzwa",
  "Kudzai",
  "Anesu",
  "Munashe",
  "Simba",
  "Shamiso",
  "Tatenda",
  "Blessing",
  "Brian",
  "Michelle",
  "Brenda",
  "Melissa",
  "Admire",
  "Prince",
  "Nyaradzo",
  "Vimbai",
  "Kundai",
  "Chenai",
  "Rumbidzai",
  "Nokutenda"
];

const lastNames = [
  "Moyo",
  "Ncube",
  "Dube",
  "Chirwa",
  "Mutsvairo",
  "Mhlanga",
  "Chikore",
  "Mupfumi",
  "Chisango",
  "Nyoni",
  "Zhou",
  "Madziva",
  "Gumbo",
  "Mapfumo",
  "Sibanda",
  "Mabena",
  "Chikowore",
  "Tsvangirai",
  "Muzenda",
  "Ndlovu"
];

const categories = [
  {
    name: "Business",
    weight: 18,
    products: [
      ["Small Business Pricing Playbook", 18, 45],
      ["Zimbabwe SME Finance Template", 12, 35],
      ["Business Plan Starter Kit", 15, 50],
      ["Sales Tracker Spreadsheet", 8, 25],
      ["Customer Research Workbook", 10, 30]
    ]
  },

  {
    name: "Education",
    weight: 17,
    products: [
      ["Study Planner & Revision System", 5, 20],
      ["Exam Preparation Masterclass", 15, 60],
      ["Teacher Lesson Plan Bundle", 12, 40],
      ["Student Notes Template Pack", 6, 25],
      ["Learning Strategy Guide", 8, 30]
    ]
  },

  {
    name: "Design",
    weight: 14,
    products: [
      ["Canva Social Media Template Pack", 8, 35],
      ["Brand Identity Starter Kit", 20, 70],
      ["Creator Thumbnail Template Pack", 7, 30],
      ["Instagram Content System", 10, 45],
      ["Presentation Design Bundle", 12, 50]
    ]
  },

  {
    name: "Technology",
    weight: 13,
    products: [
      ["No-Code Automation Toolkit", 15, 55],
      ["Web Developer Starter Templates", 18, 70],
      ["API Integration Guide", 10, 40],
      ["Python Beginner Project Pack", 8, 35],
      ["AI Workflow Playbook", 12, 50]
    ]
  },

  {
    name: "Finance",
    weight: 10,
    products: [
      ["Personal Budget Spreadsheet", 5, 20],
      ["Freelancer Finance Kit", 10, 35],
      ["Cash Flow Forecast Template", 12, 40],
      ["Savings Challenge System", 4, 15],
      ["Small Business Bookkeeping Kit", 15, 55]
    ]
  },

  {
    name: "Marketing",
    weight: 10,
    products: [
      ["30-Day Content Calendar", 8, 30],
      ["Social Media Growth Playbook", 12, 45],
      ["Email Marketing Templates", 10, 35],
      ["Digital Marketing Checklist", 6, 25],
      ["Local Business Promotion Kit", 8, 30]
    ]
  },

  {
    name: "Lifestyle",
    weight: 8,
    products: [
      ["Meal Planning Workbook", 5, 18],
      ["Fitness Habit Tracker", 4, 15],
      ["Wedding Planning Spreadsheet", 10, 35],
      ["Home Organization Planner", 6, 22],
      ["Personal Goal Setting System", 5, 20]
    ]
  },

  {
    name: "Creative",
    weight: 10,
    products: [
      ["Photography Preset Collection", 12, 40],
      ["Music Production Starter Pack", 15, 50],
      ["Writing Prompt Collection", 4, 18],
      ["Video Creator Toolkit", 12, 45],
      ["Creator Media Kit Template", 8, 30]
    ]
  }
];

const demoHandles = [
  "chitowncrossroads",
  "tanakateaches",
  "rudoevents",
  "tendaiwrites",
  "nyashaplans"
];

const passwordHash =
  bcrypt.hashSync("zimselar2026", 10);

/* =========================================================
   WIPE TEST DATA
   ========================================================= */

const wipeOrder = [
  "post_comments",
  "post_likes",
  "product_likes",
  "product_comments",
  "product_shares",
  "product_reviews",
  "download_tokens",
  "license_keys",
  "service_deliveries",
  "service_disputes",
  "cart_items",
  "purchases",
  "posts",
  "reels",
  "product_files",
  "products",
  "creators",
  "buyers",
  "reports",
  "payouts",
  "issues",
  "users"
];

for (const table of wipeOrder) {
  clearTable(table);
}

/* =========================================================
   CREATE CREATORS
   ========================================================= */

const creators = [];

for (let i = 1; i <= 200; i++) {
  const first =
    firstNames[(i - 1) % firstNames.length];

  const last =
    lastNames[
      Math.floor((i - 1) / firstNames.length) %
      lastNames.length
    ];

  const handle =
    i <= demoHandles.length
      ? demoHandles[i - 1]
      : `${cleanUsername(first)}${cleanUsername(last)}${String(i).padStart(3, "0")}`;

  const username = handle.slice(0, 24);

  const email =
    `${handle}@seed.zimselar.local`;

  const category =
    weightedPick(
      categories.map(category => ({
        value: category,
        weight: category.weight
      }))
    );

  /*
   * Latent creator quality.
   *
   * This is intentional.
   *
   * Later, when we build the ML model, we want:
   *
   * quality
   * audience
   * engagement
   * price
   * conversion
   * reviews
   *
   * to have relationships rather than being completely random.
   */

  const quality =
    Math.min(
      0.98,
      Math.max(
        0.30,
        0.35 + Math.random() * 0.60
      )
    );

  const audience =
    Math.max(
      20,
      Math.round(
        Math.pow(Math.random(), 2.1) *
        25000 *
        (0.5 + quality)
      )
    );

  const userId =
    insertDynamic("users", {
      username,
      email,
      phone:
        `+26377${String(1000000 + i).slice(-7)}`,
      password_hash: passwordHash,
      email_verified_at: daysAgo(300),
      phone_verified_at: daysAgo(300),
      name: `${first} ${last}`,
      avatar_url:
        `uploads/seed/avatars/avatar-${i}.svg`,
      created_at: daysAgo(365),
      terms_accepted_at: daysAgo(365)
    });

  const creatorId =
    insertDynamic("creators", {
      user_id: userId,
      handle,
      name: `${first} ${last}`,
      email,

      bio:
        `${first} creates practical ` +
        `${category.name.toLowerCase()} resources ` +
        `for Zimbabwean and African creators, ` +
        `students and small businesses.`,

      what_selling:
        `Digital ${category.name.toLowerCase()} ` +
        `products, templates, guides and services`,

      who_for:
        "Creators, students, freelancers and small businesses",

      avatar_path:
        `uploads/seed/avatars/avatar-${i}.svg`,

      payout_ecocash_number:
        `077${String(1000000 + i).slice(-7)}`,

      verified: 1,
      created_at: daysAgo(365),
      verified_at: daysAgo(300)
    });

  creators.push({
    id: creatorId,
    userId,
    handle,
    first,
    last,
    category,
    quality,
    audience
  });
}

/* =========================================================
   CREATE 1,000 PRODUCTS
   ========================================================= */

const products = [];

for (const creator of creators) {
  for (let p = 0; p < 5; p++) {

    const specification =
      creator.category.products[p];

    const baseTitle = specification[0];
    const minPrice = specification[1];
    const maxPrice = specification[2];

    /*
     * Better creators tend to command
     * slightly higher prices.
     */

    const price =
      Math.round(
        (
          minPrice +
          Math.random() *
          (maxPrice - minPrice)
        ) *
        (
          0.80 +
          creator.quality * 0.60
        )
      );

    const priceMinor =
      Math.max(
        100,
        Math.round(price * 100)
      );

    const title =
      `${baseTitle} — ${creator.first}`;

    const isService =
      p === 4 &&
      creator.category.name === "Business";

    const productId =
      insertDynamic("products", {
        creator_id: creator.id,

        title,

        description:
          `A practical ${creator.category.name.toLowerCase()} ` +
          `resource created by ${creator.first} ${creator.last}. ` +
          `Includes actionable examples, reusable templates ` +
          `and guidance designed for real-world use.`,

        type:
          isService
            ? "service"
            : "single",

        price_minor: priceMinor,

        currency: "USD",

        pay_what_you_want: 0,

        quantity_limit: null,

        quantity_sold: 0,

        status: "published",

        cover_path:
          `uploads/seed/covers/product-${creator.id}-${p + 1}.svg`,

        slug:
          `${slugify(title)}-${creator.id}`,

        created_at: daysAgo(330),

        category:
          creator.category.name,

        discount_percent:
          Math.random() < 0.25
            ? rand(5, 25)
            : 0,

        discount_limit:
          Math.random() < 0.25
            ? rand(5, 50)
            : null,

        discount_claimed: 0,

        portfolio_url:
          `https://example.com/${creator.handle}`,

        delivery_days:
          isService
            ? rand(1, 7)
            : null,

        service_terms:
          isService
            ? "Delivery within the stated turnaround period. One revision included."
            : null,

        review_status: "clear",

        flag_reason: null
      });

    products.push({
      id: productId,
      creatorId: creator.id,
      creator,
      priceMinor,
      type:
        isService
          ? "service"
          : "single"
    });

    /*
     * Your current DB has product_files,
     * so create a file record.
     */

    insertDynamic("product_files", {
      product_id: productId,
      kind: "external_link",
      storage_path: null,
      external_url:
        `https://example.com/download/${productId}`,
      original_filename:
        `${slugify(title)}.pdf`,
      size_bytes:
        rand(50000, 900000),
      created_at: daysAgo(300),
      file_hash: null,
      detected_mime: "application/pdf",
      page_count: rand(3, 35)
    });
  }
}

/* =========================================================
   CREATE BUYERS
   ========================================================= */

const buyers = [];

for (let i = 1; i <= 250; i++) {

  const first =
    firstNames[(i + 7) % firstNames.length];

  const last =
    lastNames[(i + 3) % lastNames.length];

  const username =
    `buyer${String(i).padStart(3, "0")}`;

  const email =
    `${username}@seed.zimselar.local`;

  const userId =
    insertDynamic("users", {
      username,
      email,

      phone:
        `+26371${String(2000000 + i).slice(-7)}`,

      password_hash: passwordHash,

      email_verified_at:
        daysAgo(250),

      phone_verified_at:
        daysAgo(250),

      name:
        `${first} ${last}`,

      avatar_url: null,

      created_at:
        daysAgo(300),

      terms_accepted_at:
        daysAgo(300)
    });

  const buyerId =
    insertDynamic("buyers", {
      name:
        `${first} ${last}`,

      email,

      created_at:
        daysAgo(250),

      user_id: userId
    });

  buyers.push({
    id: buyerId,
    userId,
    name: `${first} ${last}`
  });
}

/* =========================================================
   CREATE 3,500 PURCHASES
   ========================================================= */

const paidPurchases = [];

for (let i = 0; i < 3500; i++) {

  /*
   * Products from better creators with
   * larger audiences get more probability.
   */

  const product =
    weightedPick(
      products.map(product => ({
        value: product,

        weight:
          Math.max(
            1,

            product.creator.quality *
            Math.max(
              1,
              product.creator.audience
            ) *

            (
              0.35 +
              Math.random() * 1.65
            )
          )
      }))
    );

  const buyer = pick(buyers);

  const randomStatus = Math.random();

  const paymentStatus =
    randomStatus < 0.90
      ? "paid"
      : randomStatus < 0.96
        ? "pending"
        : "failed";

  const discount =
    Math.random() < 0.18;

  const amountMinor =
    discount
      ? Math.round(
          product.priceMinor *
          (
            0.75 +
            Math.random() * 0.15
          )
        )
      : product.priceMinor;

  const purchaseId =
    insertDynamic("purchases", {
      buyer_id: buyer.id,

      product_id: product.id,

      amount_minor: amountMinor,

      currency: "USD",

      payment_reference:
        `SEED-${Date.now()}-${i}`,

      payment_status: paymentStatus,

      created_at:
        daysAgo(240),

      discount_applied:
        discount ? 1 : 0,

      fulfillment_status:
        paymentStatus === "paid"
          ? (
              product.type === "service"
                ? "awaiting_delivery"
                : "delivered"
            )
          : null,

      delivered_at:
        paymentStatus === "paid" &&
        product.type !== "service"
          ? daysAgo(180)
          : null
    });

  if (paymentStatus === "paid") {
    paidPurchases.push({
      purchaseId,
      product,
      buyer
    });
  }
}

/* =========================================================
   PRODUCT ENGAGEMENT
   ========================================================= */

for (let i = 0; i < 6000; i++) {

  const product =
    weightedPick(
      products.map(product => ({
        value: product,

        weight:
          Math.max(
            1,
            product.creator.quality * 2 +
            Math.random()
          )
      }))
    );

  const buyer = pick(buyers);

  if (hasTable("product_likes")) {

    insertDynamic("product_likes", {
      product_id: product.id,
      buyer_id: buyer.id,
      user_id: buyer.userId,
      created_at: daysAgo(180)
    });
  }

  if (
    hasTable("product_comments") &&
    Math.random() < 0.28
  ) {

    const comment = pick([
      "Very useful and easy to follow.",
      "This saved me a lot of time.",
      "Great resource.",
      "Would love an expanded version.",
      "The templates are practical."
    ]);

    insertDynamic("product_comments", {
      product_id: product.id,
      buyer_id: buyer.id,
      user_id: buyer.userId,
      comment,
      body: comment,
      created_at: daysAgo(150)
    });
  }

  if (
    hasTable("product_shares") &&
    Math.random() < 0.16
  ) {

    insertDynamic("product_shares", {
      product_id: product.id,
      user_id: buyer.userId,
      buyer_id: buyer.id,
      created_at: daysAgo(150)
    });
  }
}

/* =========================================================
   PRODUCT REVIEWS
   ========================================================= */

if (hasTable("product_reviews")) {

  for (
    const sale
    of paidPurchases.slice(0, 1600)
  ) {

    if (Math.random() > 0.72) {
      continue;
    }

    const quality =
      sale.product.creator.quality;

    const rating =
      Math.min(
        5,
        Math.max(
          1,
          Math.round(
            2 +
            quality * 3 +
            (Math.random() - 0.5)
          )
        )
      );

    insertDynamic("product_reviews", {
      product_id:
        sale.product.id,

      buyer_id:
        sale.buyer.id,

      user_id:
        sale.buyer.userId,

      purchase_id:
        sale.purchaseId,

      rating,

      review: pick([
        "Clear, practical and worth the price.",
        "Good quality resource with useful examples.",
        "Exactly what I needed.",
        "Helpful material and easy to use.",
        "Solid product. I would recommend it."
      ]),

      comment:
        "Useful resource with practical examples.",

      created_at:
        daysAgo(130)
    });
  }
}

/* =========================================================
   POSTS
   ========================================================= */

if (hasTable("posts")) {

  for (const creator of creators) {

    const creatorProducts =
      products.filter(
        p => p.creatorId === creator.id
      );

    for (let i = 0; i < 4; i++) {

      const type =
        pick([
          "text",
          "photo",
          "video"
        ]);

      insertDynamic("posts", {
        creator_id:
          creator.id,

        product_id:
          pick(creatorProducts).id,

        type,

        media_path:
          type === "text"
            ? null
            : `uploads/seed/posts/post-${creator.id}-${i + 1}.svg`,

        caption:
          pick([
            "New resource available on Zimselar.",
            "Building practical tools for creators.",
            "A quick tip from today's work.",
            "What are you working on this week?",
            "Sharing something useful with the community."
          ]),

        created_at:
          daysAgo(120)
      });
    }
  }
}

/* =========================================================
   REELS
   ========================================================= */

if (hasTable("reels")) {

  for (const creator of creators) {

    const creatorProducts =
      products.filter(
        p => p.creatorId === creator.id
      );

    for (let i = 0; i < 2; i++) {

      insertDynamic("reels", {
        creator_id:
          creator.id,

        product_id:
          pick(creatorProducts).id,

        video_path:
          `uploads/seed/reels/reel-${creator.id}-${i + 1}.svg`,

        caption:
          "Quick creator tip",

        view_count:
          Math.round(
            creator.audience *
            (
              0.05 +
              Math.random() * 0.8
            )
          ),

        created_at:
          daysAgo(100)
      });
    }
  }
}

/* =========================================================
   SERVICE DELIVERIES
   ========================================================= */

if (hasTable("service_deliveries")) {

  const serviceSales =
    paidPurchases
      .filter(
        sale =>
          sale.product.type === "service"
      )
      .slice(0, 500);

  for (const sale of serviceSales) {

    const delivered =
      Math.random() < 0.8;

    insertDynamic("service_deliveries", {

      purchase_id:
        sale.purchaseId,

      product_id:
        sale.product.id,

      creator_id:
        sale.product.creatorId,

      buyer_id:
        sale.buyer.id,

      status:
        delivered
          ? "delivered"
          : "pending",

      delivery_path:
        null,

      message:
        "Seed service delivery record.",

      created_at:
        daysAgo(100),

      delivered_at:
        delivered
          ? daysAgo(60)
          : null
    });
  }
}

/* =========================================================
   CARTS
   ========================================================= */

if (hasTable("cart_items")) {

  for (let i = 0; i < 80; i++) {

    const buyer = pick(buyers);
    const product = pick(products);

    insertDynamic("cart_items", {
      buyer_id: buyer.id,
      user_id: buyer.userId,
      product_id: product.id,
      quantity: 1,
      created_at: daysAgo(30)
    });
  }
}

/* =========================================================
   ISSUES
   ========================================================= */

if (hasTable("issues")) {

  for (let i = 1; i <= 15; i++) {

    const buyer = pick(buyers);

    insertDynamic("issues", {
      user_id: buyer.userId,

      title:
        `Seed support issue ${i}`,

      description:
        "Synthetic support issue for dashboard testing.",

      issue_number:
        `SEED-${String(i).padStart(4, "0")}`,

      status:
        "open",

      created_at:
        daysAgo(45)
    });
  }
}

/* =========================================================
   OPTIONAL PAYOUTS
   ========================================================= */

if (hasTable("payouts")) {

  const revenue = new Map();

  for (const sale of paidPurchases) {

    const creatorId =
      sale.product.creatorId;

    revenue.set(
      creatorId,

      (
        revenue.get(creatorId) || 0
      ) +
      sale.product.priceMinor
    );
  }

  for (
    const [creatorId, amount] of revenue
  ) {

    if (Math.random() < 0.70) {

      insertDynamic("payouts", {

        creator_id:
          creatorId,

        amount_minor:
          Math.round(amount * 0.80),

        currency:
          "USD",

        status:
          "paid",

        payment_reference:
          `SEED-PAYOUT-${creatorId}`,

        created_at:
          daysAgo(60)
      });
    }
  }
}

/* =========================================================
   OPTIONAL REPORTS
   ========================================================= */

if (hasTable("reports")) {

  for (let i = 0; i < 20; i++) {

    const buyer = pick(buyers);
    const product = pick(products);

    insertDynamic("reports", {

      reporter_id:
        buyer.userId,

      user_id:
        buyer.userId,

      product_id:
        product.id,

      reason:
        pick([
          "spam",
          "copyright",
          "misleading"
        ]),

      description:
        "Synthetic marketplace report for testing.",

      status:
        "open",

      created_at:
        daysAgo(45)
    });
  }
}

/* =========================================================
   UPDATE PRODUCT SALES
   ========================================================= */

if (hasColumn("products", "quantity_sold")) {

  const sales =
    db.prepare(`
      SELECT
        product_id,
        COUNT(*) AS n
      FROM purchases
      WHERE payment_status = 'paid'
      GROUP BY product_id
    `).all();

  const update =
    db.prepare(`
      UPDATE products
      SET quantity_sold = @n
      WHERE id = @id
    `);

  for (const row of sales) {
    update.run({
      id: row.product_id,
      n: row.n
    });
  }
}

/* =========================================================
   FINISH
   ========================================================= */

db.pragma("foreign_keys = ON");

db.close();

console.log("");
console.log("==========================================");
console.log("       ZIMSELAR SEED COMPLETE");
console.log("==========================================");
console.log("");
console.log(`Creators:       ${creators.length}`);
console.log(`Products:       ${products.length}`);
console.log(`Buyers:         ${buyers.length}`);
console.log(`Paid purchases: ${paidPurchases.length}`);
console.log("");
console.log("Password for ALL seeded accounts:");
console.log("  zimselar2026");
console.log("");
console.log("Demo creator accounts:");
console.log("  chitowncrossroads");
console.log("  tanakateaches");
console.log("  rudoevents");
console.log("  tendaiwrites");
console.log("  nyashaplans");
console.log("");
console.log("==========================================");
```



