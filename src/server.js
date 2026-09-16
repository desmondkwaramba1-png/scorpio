require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');

const { UPLOADS_DIR } = require('./lib/paths');
const { attachUser } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const oauthRouter = require('./routes/oauth');
const creatorsRouter = require('./routes/creators');
const productsRouter = require('./routes/products');
const purchasesRouter = require('./routes/purchases');
const subscriptionsRouter = require('./routes/subscriptions');
const blogRouter = require('./routes/blog');
const cartRouter = require('./routes/cart');
const insightsRouter = require('./routes/insights');
const walletRouter = require('./routes/wallet');
const downloadsRouter = require('./routes/downloads');
const adminRouter = require('./routes/admin');
const reelsRouter = require('./routes/reels');
const reportsRouter = require('./routes/reports');
const sitemapRouter = require('./routes/sitemap');
const shareRouter = require('./routes/share');

// origin: true (reflect whatever Origin header showed up) plus
// credentials: true used to mean any website could make an authenticated
// fetch() against this API using a logged-in visitor's session cookie —
// sameSite:'lax' on the cookie blocks the most common form of that, but
// CORS is the actual, correct place to enforce "only our frontend talks to
// this API with credentials." Locked to FRONTEND_URL (plus the two dev
// ports) instead. Requests with no Origin header (curl, server-to-server,
// same-origin) are still allowed through — that check is what CORS can't
// and isn't meant to police.
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
// The admin app (admin/) is a second, separate frontend on its own domain
// (see admin/vite.config.js) — Vercel's rewrite makes its API calls same-
// origin from the browser's own point of view, but browsers still attach
// a real Origin header to state-changing requests (POST/PATCH/DELETE) even
// then, so without this every admin mutation (the blog editor's publish
// button, e.g.) failed CORS while every plain GET on the same page quietly
// worked — GET requests weren't sending an Origin header this server ever
// checked. Confirmed live: POST /api/blog/admin/posts from admin.scorpio.co.zw
// came back "Origin not allowed" while GETs from the same page succeeded.
const ADMIN_URL = 'https://admin.scorpio.co.zw';
const ALLOWED_ORIGINS = new Set([
  FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173',
  ADMIN_URL, 'http://localhost:5174', 'http://127.0.0.1:5174'
]);
// A domain is reachable at both its apex and its www subdomain (Vercel
// redirects one to the other), so the browser's actual Origin header can be
// either depending on which one FRONTEND_URL happens to be set to — allow
// both instead of requiring them to match exactly.
try {
  const frontendHost = new URL(FRONTEND_URL);
  const altHost = frontendHost.hostname.startsWith('www.')
    ? frontendHost.hostname.slice(4)
    : `www.${frontendHost.hostname}`;
  ALLOWED_ORIGINS.add(`${frontendHost.protocol}//${altHost}`);
} catch {}

const app = express();
// Fly's edge proxy is the one hop in front of this app, so trusting
// exactly 1 proxy (not `true`, which would trust an arbitrary chain of
// client-supplied X-Forwarded-For values) is the correct, safe setting —
// without this, express-rate-limit can't safely read the real client IP
// from X-Forwarded-For and throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on
// every rate-limited request (auth, checkout, reports), confirmed live in
// production logs.
app.set('trust proxy', 1);
// contentSecurityPolicy: false — this app is a JSON API; the only HTML it
// serves itself (share.js's link-preview pages, admin's none) is small
// and trusted, and helmet's default page CSP would block the inline
// redirect script /share relies on for a browser that somehow lands
// there. crossOriginResourcePolicy: cross-origin — the frontend is a
// different origin (Vercel) fetching this API's JSON directly; the
// default same-origin policy is meant for a server that also serves its
// own frontend, which this one doesn't.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(attachUser);
// Same reasoning as db/schema.js: a freshly-mounted volume has no
// uploads/ subdirectory yet, and multer's own destination configs (see
// each route file) don't create parent directories either.
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

app.use('/api/auth', authRouter);
app.use('/api/auth', oauthRouter);
app.use('/api/creators', creatorsRouter);
app.use('/api/products', productsRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/blog', blogRouter);
app.use('/api/cart', cartRouter);
app.use('/api/insights', insightsRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/downloads', downloadsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/reels', reelsRouter);
app.use('/api/reports', reportsRouter);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
// Mounted at root, not under /api — see client/vercel.json's dedicated
// /sitemap.xml rewrite, since that's the URL search engines expect.
app.use('/', sitemapRouter);
// Link-preview HTML for social crawlers — Vercel rewrites crawler
// user-agents here (client/vercel.json). Never hit by a normal browser.
app.use('/share', shareRouter);

// Without this, a rejected upload (wrong file type, or over multer's
// per-route size limit) throws past every route handler and lands on
// Express's default error page — an HTML response the frontend's fetch()
// calls can't parse, so a real "your file is too big" moment shows up to
// the user as an unexplained crash instead of the clear error it should be.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large.' : err.message;
    return res.status(400).json({ error: message });
  }
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }
  // Covers fileFilter rejections (a plain Error, not a MulterError) and
  // anything else that slipped past a route's own try/catch — every route
  // in this app already handles its own expected failures directly, so
  // whatever reaches here is either that or a real bug. Either way, a
  // readable 400 beats Express's default HTML crash page hitting a
  // fetch() call that can only ever expect JSON back.
  if (err) {
    console.error(err);
    return res.status(400).json({ error: err.message || 'Something went wrong with that request.' });
  }
  next();
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`SCORPIO API running on port ${PORT}`));
