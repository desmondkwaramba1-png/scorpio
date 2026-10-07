# ZIMSELAR — Create, Sell, Empower

## Structure
```
zimselar/
  src/           backend (Express + SQLite)
    db/          schema.js, seed.js
    routes/      creators, products, purchases
    services/    payment.js — EcoCash payment integration through Dischub
  client/        frontend (React + Vite)
    src/pages/   Marketplace, Sell, NewProduct, Product
    src/components/  Nav, Seal (verified-creator badge)
```

## Run it (backend)
```
cd zimselar
npm install
npm run seed      # loads Pauline's newspaper as real seed data
npm start          # runs on :4000
```

## Run it (frontend)
```
cd zimselar/client
npm install
npm run dev         # runs on :5173, proxies /api and /uploads to :4000
```

Run both at once, two terminals. Visit http://localhost:5173.

## What's built
- Creator signup with the two qualification questions (`what_selling`, `who_for`)
- Required cover image on every product — no product without one
- Marketplace grid, public product/storefront page, checkout flow
- Seal badge for verified creators (the trust signal, tied to qualification)
- EcoCash checkout through Dischub: payment prompts are sent to buyers and orders are fulfilled only after gateway confirmation
- Payment provider requests and status checks are isolated in `src/services/payment.js`

## What's next, in order (per our agreed sequencing)
1. Social layer — a lightweight text/image "story" per product first
2. Full reels/video — once there's a real creator base worth watching

## Design
Colors pulled from the Zimbabwe flag but used functionally, not literally: green as brand/primary, gold as the accent/CTA color, red reserved for errors only. Sora for headings, Inter for body, JetBrains Mono for prices and labels. The seal badge is the signature element — it ties directly to the qualification questions: a mark that's earned, not decorative.
