import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Update the service worker (and reload) automatically on a new
      // deploy — this app ships multiple times a day; a 'prompt' strategy
      // would leave someone stuck on a stale cached version until they
      // notice and click something.
      // registerType: 'autoUpdate' only actually auto-updates when the app
      // imports the virtual:pwa-register module and calls it (see
      // main.jsx), that's what tells a newly-installed worker to
      // skipWaiting and reloads the page once it takes over. Without that
      // import, this setting was a no-op, the bare injected register
      // script never sent the skip-waiting signal, so a new version sat
      // in "waiting" until a tab was fully closed and reopened, real bug
      // this session ran straight into shipping the Reels nav icon.
      registerType: 'autoUpdate',
      // injectRegister: null, not 'inline'/'script' — main.jsx's own
      // virtual:pwa-register import handles registration now, injecting
      // a second script that also calls .register() would be redundant.
      // Bonus: the registration logic is bundled into the main JS chunk
      // this way too, so the earlier fix for registerSW.js being a
      // separate render-blocking request stays fixed either way.
      injectRegister: null,
      includeAssets: ['brand/mark.svg', 'brand/apple-touch-icon.png'],
      manifest: {
        name: 'SCORPIO — Create, Sell, Empower',
        short_name: 'SCORPIO',
        description: 'Buy and sell digital products in Zimbabwe. Pay with EcoCash.',
        // Matches --green-dark (the app's fixed navy chrome, see index.css)
        // — the color a browser/OS paints behind the splash/status bar
        // before the page's own CSS has loaded.
        theme_color: '#131921',
        background_color: '#131921',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/brand/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // generateSW's own default behavior, separate from runtimeCaching
        // below and not mentioned by the comment that used to be here:
        // every "navigate"-mode request (a real <a href> click or typed
        // URL, not a fetch()) gets intercepted by an auto-installed
        // NavigationRoute and handed the cached index.html shell instead
        // of ever reaching the network. Necessary for real client-side
        // routes (so /discover, /@handle/slug work on a direct load or
        // refresh) — actively wrong for /api/downloads/:token, a plain
        // <a href> in Account.jsx and Product.jsx that's a real server
        // redirect to R2, not a route this SPA has any page for. Once the
        // service worker had time to activate, clicking Download just
        // reloaded the app shell, no error, nothing to download, silently.
        // Confirmed live: a fresh signup through a full session (several
        // page loads, real time for the worker to install) got exactly
        // this, text/html back instead of a redirect to the file. Excluding
        // /api/ here is what actually lets a real navigation to /api/downloads/:token
        // reach the network instead of being treated as a client route.
        navigateFallbackDenylist: [/^\/api\//],
        // Everything NOT matched by a rule below is a plain network
        // passthrough, never touched by the service worker — this is
        // deliberately an allowlist, not a blocklist, so anything
        // session/payment-sensitive (auth, cart, checkout, downloads) is
        // safe by default just by never being mentioned here, not because
        // of an exclusion I have to remember to keep correct. (That
        // reasoning covers runtimeCaching's own handlers — it doesn't
        // cover the separate NavigationRoute above, which is why the
        // downloads bug existed despite it.)
        runtimeCaching: [
          {
            // Product/creator listings: try the network first (prices and
            // stock need to be real), but don't make someone on a
            // congested connection wait forever for it — fall back to the
            // last good response after 4s instead of hanging.
            urlPattern: ({ url, request }) => request.method === 'GET' && /^\/api\/(products|creators)(\/|\?|$)/.test(url.pathname + url.search),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-reads',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 6 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // Product covers, creator avatars, reels thumbnails — served
            // from R2, essentially immutable once uploaded (a new upload
            // gets a new key, see storage.js), and the single biggest
            // piece of data weight on this app. Safe to cache aggressively
            // and exactly where "reduce network demand" actually pays off.
            urlPattern: ({ url }) => /\.r2\.(dev|cloudflarestorage\.com)$/.test(url.hostname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'r2-media',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'api.fontshare.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    // Lets the Cloudflare quick tunnel (a random *.trycloudflare.com host
    // each time it starts) reach the dev server — Vite blocks unrecognized
    // Host headers by default. Needed only for testing the Dischub
    // redirect_url/webhook flow, which Dischub refuses to send to
    // localhost.
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000'
    }
  }
});
