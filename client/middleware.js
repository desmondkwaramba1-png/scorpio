// Vercel Routing Middleware: serves the app's HTML with a fresh CSP nonce on every response.
//
// Why: the CapShield widget runs its browser check in a sandboxed srcdoc frame whose inline
// script must carry a nonce allowed by this page's script-src (the frame inherits our CSP).
// A static vercel.json header can't hold a per-response nonce, and a fixed nonce or
// 'unsafe-inline' would let injected scripts run. So each HTML response gets:
//   - a random 128-bit nonce, used once
//   - <script nonce>window.CAP_SCRIPT_NONCE = "…"</script> before any other script
//   - the same CSP as vercel.json, plus 'nonce-…' and 'wasm-unsafe-eval' in script-src
//     ('wasm-unsafe-eval' allows WebAssembly compilation only, not eval / new Function)
//   - Cache-Control: no-store, so a nonce is never served from a shared cache
//
// Only page navigations come here (see config.matcher). Static files, /api and /uploads are
// untouched. Link-preview bots go straight on to the /share rewrite in vercel.json.

const SOCIAL_BOTS = /facebookexternalhit|Facebot|Twitterbot|WhatsApp|LinkedInBot|Slackbot|Slack-ImgProxy|TelegramBot|Discordbot|Pinterest|redditbot|SkypeUriPreview|vkShare|W3C_Validator|Embedly|Iframely|nuzzel|Mastodon|Pleroma|Yahoo Link Preview|facebookcatalog/;

export function buildCsp(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' https://capshield.vercel.app`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://scorpio-api.fly.dev https://capshield.vercel.app https://*.r2.cloudflarestorage.com https://*.r2.dev",
    "worker-src 'self' blob:",
    "frame-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function makeNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function injectNonce(html, nonce) {
  const tag = `<script nonce="${nonce}">window.CAP_SCRIPT_NONCE=${JSON.stringify(nonce)};</script>`;
  const i = html.search(/<head[^>]*>/i);
  if (i === -1) return null;
  const end = html.indexOf('>', i) + 1;
  return html.slice(0, end) + tag + html.slice(end);
}

// Our built index.html: the React mount point and a same-origin module bundle.
export function isAppShell(html) {
  return html.length < 200000 && html.includes('<div id="root"></div>') && /<script type="module"[^>]*src="\/(assets|src)\//.test(html);
}

const pass = () => new Response(null, { headers: { 'x-middleware-next': '1' } });

export default async function middleware(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return pass();
  if (SOCIAL_BOTS.test(request.headers.get('user-agent') || '')) return pass();

  // The app shell from this same deployment. Only the credentials preview-deployment protection
  // needs are forwarded, and redirects are refused: if the shell can't be read directly (e.g. a
  // protected preview bouncing to a sign-in page), serve the static file instead of whatever
  // the redirect returns.
  const shellUrl = new URL('/index.html', request.url);
  const headers = {};
  for (const h of ['cookie', 'x-vercel-protection-bypass']) {
    const v = request.headers.get(h);
    if (v) headers[h] = v;
  }
  let html;
  try {
    const res = await fetch(shellUrl, { headers, redirect: 'manual' });
    if (res.status !== 200 || !/^text\/html/i.test(res.headers.get('content-type') || '')) return pass();
    html = await res.text();
  } catch {
    return pass(); // fall back to the static file and vercel.json's CSP
  }
  if (!isAppShell(html)) return pass();

  const nonce = makeNonce();
  const body = injectNonce(html, nonce);
  if (!body) return pass();

  return new Response(request.method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
      'content-security-policy': buildCsp(nonce),
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    },
  });
}

// Page routes only: anything without a file extension, outside /api, /uploads and build output.
export const config = {
  matcher: ['/((?!api/|uploads/|assets/|brand/|_vercel|.*\\.[a-zA-Z0-9]+$).*)'],
};
