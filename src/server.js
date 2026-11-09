require('dotenv').config();
const express = require('express');
require('./lib/asyncErrors').installProcessSafetyNet();
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');
const { randomUUID } = require('crypto');

const { UPLOADS_DIR } = require('./lib/paths');
const db = require('./db/schema');
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
const disputesRouter = require('./routes/disputes');
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
  FRONTEND_URL,
  'https://scorpio.co.zw', 'https://www.scorpio.co.zw',
  ADMIN_URL
]);
// Local dev servers are only trusted when this isn't production.
if (process.env.NODE_ENV !== 'production') {
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174']) {
    ALLOWED_ORIGINS.add(origin);
  }
}
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
//
// Browser traffic that arrives through the Vercel rewrite has a second hop in
// front of Fly. If production logs show every req.ip as a Vercel address, set
// TRUST_PROXY_HOPS=2 so limits apply per visitor instead of per Vercel edge.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);

// Every failed or rate-limited request is logged, so problems show up in
// `fly logs`. The address shows whether rate limits see real visitors or a proxy.
app.use((req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode !== 429 && res.statusCode < 500) return;
    console.warn('[http]', JSON.stringify({ status: res.statusCode, method: req.method, path: req.path, ip: req.ip, forwarded: req.get('X-Forwarded-For') || null }));
  });
  next();
});
app.use((req, res, next) => {
  const isProductUploadPath = req.path === '/api/products' ||
    req.path === '/api/products/' ||
    req.path === '/api/products/upload-token' ||
    /^\/api\/products\/\d+$/.test(req.path);
  if (!isProductUploadPath || !['OPTIONS', 'POST', 'PATCH'].includes(req.method)) return next();

  const suppliedId = req.get('X-Request-ID');
  req.uploadRequestId = typeof suppliedId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedId)
    ? suppliedId
    : randomUUID();
  res.setHeader('X-Request-ID', req.uploadRequestId);

  if (req.method === 'OPTIONS' || req.path === '/api/products/upload-token') {
    const startedAt = Date.now();
    let finished = false;
    res.once('finish', () => {
      finished = true;
      console.info('[product upload transport]', JSON.stringify({
        event: req.method === 'OPTIONS' ? 'preflight' : 'authorization',
        requestId: req.uploadRequestId,
        path: req.path,
        origin: req.get('Origin') || null,
        requestedMethod: req.get('Access-Control-Request-Method') || null,
        requestedHeaders: req.get('Access-Control-Request-Headers') || null,
        status: res.statusCode,
        durationMs: Date.now() - startedAt
      }));
    });
    res.once('close', () => {
      if (!finished) {
        console.warn('[product upload transport]', JSON.stringify({
          event: 'closed',
          requestId: req.uploadRequestId,
          path: req.path,
          origin: req.get('Origin') || null,
          durationMs: Date.now() - startedAt
        }));
      }
    });
  }
  next();
});
// This app is a JSON API, so nothing it returns should ever load anything.
// share.js sets its own looser policy for its small link-preview pages.
// crossOriginResourcePolicy: cross-origin — the frontend is a
// different origin (Vercel) fetching this API's JSON directly; the
// default same-origin policy is meant for a server that also serves its
// own frontend, which this one doesn't.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  exposedHeaders: ['X-Request-ID']
}));
app.use(express.json({ limit: '2mb' }));
// cookie-parser has to run before both sessions (attachUser reads
// req.cookies) and csurf({ cookie: true }). Without it, every logged-in
// mutation — including product publish/edit — saw no session cookie and
// CSRF had nowhere to store its secret, so a failed publish left creators
// unable to retry or edit: the request never reached the product handler.
app.use(cookieParser());

const csurf = require('csurf');
const csrfProtection = csurf({
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
});

function maybeCsrf(req, res, next) {
  // Dischub's webhook is a server-to-server POST with no browser cookie
  // and no CSRF token to send; status is re-checked against Dischub
  // itself (see routes/purchases.js), so skipping CSRF here isn't
  // skipping the real authenticity check.
  if (req.path === '/api/purchases/dischub/callback') return next();
  // Large product files go directly to the API host so the frontend proxy
  // never buffers their bytes. This bearer token is minted by the
  // CSRF-protected upload-token route and verified by productsRouter before
  // any product mutation, so a cross-origin upload must not depend on the
  // frontend-origin CSRF cookie being sent to the API host.
  if (req.get('X-Product-Upload-Token') &&
      ((req.method === 'POST' && req.path === '/api/products') ||
       (req.method === 'PATCH' && /^\/api\/products\/\d+$/.test(req.path)))) return next();
  // Admin app authenticates with X-Admin-Key, not the buyer/seller
  // session cookie. Requiring a CSRF cookie there blocked every admin
  // mutation (dispute resolve, blog publish) while GETs still worked.
  if (adminRouter.isValidAdminKey(req.headers['x-admin-key'])) return next();
  csrfProtection(req, res, next);
}

app.use(maybeCsrf);
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});
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
app.use('/api/disputes', disputesRouter);

// Healthy means the database answers too, so Fly restarts a machine whose
// volume or database has stopped working, not just one that stopped listening.
app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[health]', err.message);
    res.status(503).json({ status: 'error' });
  }
});
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
  const requestId = req.uploadRequestId || req.get('X-Request-ID') || null;
  const isProductUpload = Boolean(requestId) ||
    (['POST', 'PATCH'].includes(req.method) &&
      (req.path === '/api/products' || /^\/api\/products\/\d+$/.test(req.path)));
  const logUploadError = (status, code, message) => {
    if (!isProductUpload) return;
    console.error('[product upload request error]', JSON.stringify({
      requestId,
      method: req.method,
      path: req.path,
      origin: req.get('Origin') || null,
      status,
      code: code || null,
      message: message || null
    }));
  };
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large.' : err.message;
    logUploadError(400, err.code, message);
    return res.status(400).json({ error: message });
  }
  if (err && err.code === 'EBADCSRFTOKEN') {
    logUploadError(403, err.code, 'CSRF validation failed.');
    return res.status(403).json({ error: 'That request expired. Refresh the page and try again.' });
  }
  if (err && err.message === 'Not allowed by CORS') {
    logUploadError(403, 'CORS_ORIGIN_REJECTED', 'Origin not allowed.');
    return res.status(403).json({ error: 'Origin not allowed.' });
  }
  // Plain Errors here are deliberate messages (fileFilter rejections and the
  // like). Anything else is a real bug: log it, answer 500 so monitoring can
  // see it, and keep internal details such as SQL errors away from visitors.
  if (err) {
    console.error(err);
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That request is too large.' });
    if (typeof err.type === 'string' && /^(entity|request|encoding|charset)\./.test(err.type)) {
      return res.status(400).json({ error: 'That request could not be read.' });
    }
    if (err.name === 'Error' && !err.code && err.message) {
      logUploadError(400, err.code, err.message);
      return res.status(400).json({ error: err.message });
    }
    logUploadError(500, err.code, err.message);
    return res.status(500).json({ error: 'Something went wrong on our side. Try again in a moment.' });
  }
  next();
});

const PORT = process.env.PORT || 4000;
const server = require('http').createServer({
  requestTimeout: 30 * 60 * 1000,
  headersTimeout: 65 * 1000
}, app);
server.listen(PORT, () => console.log(`SCORPIO API running on port ${PORT}`));
require('./lib/reconcilePayments').startPaymentReconciler();
require('./lib/housekeeping').startHousekeeping();
require('./lib/subscriptions').startRenewalSweep();

// Finish requests in flight and close the database before a deploy or restart
// stops the machine, so no write is cut off halfway.
function shutdown(signal) {
  console.info(`[shutdown] ${signal}`);
  server.close(() => {
    try { db.close(); } catch { /* already closed */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 8000).unref();
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
