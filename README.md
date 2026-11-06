# SCORPIO

A marketplace for Zimbabwean creators to sell ebooks, templates and courses, with EcoCash checkout.

## How it fits together

| Part | Stack | Hosted on |
|---|---|---|
| `src/` API | Express, SQLite (better-sqlite3) | Fly.io, one machine with a volume |
| `client/` storefront and seller dashboard | React, Vite, PWA | Vercel |
| `admin/` operations dashboard | React, Vite | Vercel |
| File storage | Cloudflare R2 | |
| Payments | EcoCash through Dischub | |
| Email | Resend | |

## Run it locally

Use Node 20 to 24 (`better-sqlite3` has no prebuilt binary beyond that).

```bash
cp .env.example .env
npm install
npm run seed        # optional demo data; prints a one-off password
npm start           # API on :4000

cd client && npm install && npm run dev   # storefront on :5173
cd admin && npm install && npm run dev    # admin on :5174
```

Without R2 configured, uploads return a clear 503. Without `RESEND_API_KEY`, emails print to the console.

## Checks

```bash
npm run lint
npm test            # all backend suites, on throwaway databases, nothing external is called
```

CI runs these and builds both frontends on every push to `main` and every pull request. `scripts/test-security-regressions.js` holds a test for each issue found in the November 2026 audit.

## Before going live

- Set `NODE_ENV=production`, a long random `ADMIN_KEY`, and every key in `.env.example`.
- Never run the demo seed against production. It refuses when `NODE_ENV=production`.
- With a live Dischub key, every checkout sends a real EcoCash prompt. There is no test mode switch.
- If production logs show visitors with Vercel addresses, set `TRUST_PROXY_HOPS=2`.
- `GOOGLE_REDIRECT_URI` must be on the same host that starts sign-in, so the session and OAuth cookies match.
- Back up the SQLite volume. All orders and payouts live in that one file.

## Design system

Tokens are at the top of `client/src/index.css` and `admin/src/index.css`.

| Token | Use |
|---|---|
| `--chrome` dark | Nav, hero, footer |
| `--brand` orange | The one signature colour: buy buttons, highlights, the Verified seal |
| `--brand-strong` deep orange | Orange text and icons, because raw orange is too light on white |
| `--ink` black | Primary actions in seller tools |
| `--success`, `--warning`, `--red` | Status only, never decoration |

Don't add a second bright colour: it competes with the orange wordmark. The wordmark, logo, splash artwork and icons are fixed brand assets.

Type is Geist, with Geist Mono for prices and Alex Brush for the wordmark. All are self-hosted through Fontsource, so the app makes no third-party font requests.
