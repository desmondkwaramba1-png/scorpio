// Tests for client/middleware.js (the per-response CSP nonce for the CapShield widget).
import assert from 'node:assert/strict';
import middleware, { buildCsp, injectNonce, makeNonce, config } from '../client/middleware.js';

const SHELL = '<!DOCTYPE html><html lang="en"><head>\n<meta charset="UTF-8" /></head><body><div id="root"></div><script type="module" src="/assets/index.js"></script></body></html>';
const originalFetch = globalThis.fetch;
let cases = 0;

function directives(csp) {
  return Object.fromEntries(csp.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
}

try {
  // Nonces are random, 128-bit, base64, and never repeat.
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const n = makeNonce();
    assert.match(n, /^[A-Za-z0-9+/]{22}==$/);
    assert.ok(!seen.has(n), 'nonce repeated');
    seen.add(n);
  }
  cases++;

  // The CSP: nonce + WebAssembly only. Never unsafe-inline / unsafe-eval for scripts.
  const d = directives(buildCsp('abc123'));
  assert.deepEqual(d['script-src'], ["'self'", "'nonce-abc123'", "'wasm-unsafe-eval'", 'https://capshield.vercel.app']);
  assert.ok(!d['script-src'].includes("'unsafe-inline'") && !d['script-src'].includes("'unsafe-eval'"));
  assert.deepEqual(d['object-src'], ["'none'"]);
  assert.deepEqual(d['frame-ancestors'], ["'none'"]);
  assert.ok(d['connect-src'].includes('https://capshield.vercel.app'));
  assert.ok(d['worker-src'].includes('blob:'));
  cases++;

  // The nonce script goes first in <head>, before the app's scripts.
  const out = injectNonce(SHELL, 'N0nce==');
  assert.ok(out.indexOf('<script nonce="N0nce==">window.CAP_SCRIPT_NONCE="N0nce==";</script>') < out.indexOf('/assets/index.js'));
  assert.equal(injectNonce('<html><body></body></html>', 'x'), null, 'no <head>: leave the page alone');
  cases++;

  // A page request: HTML with a fresh nonce matching the CSP, never cached.
  globalThis.fetch = async (url, opts) => {
    assert.equal(String(url), 'https://www.scorpio.co.zw/index.html');
    assert.equal(opts.headers.cookie, 'a=b');
    return new Response(SHELL, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  };
  const page = () => middleware(new Request('https://www.scorpio.co.zw/login', { headers: { cookie: 'a=b', 'user-agent': 'Mozilla/5.0 Chrome/130' } }));
  const r1 = await page();
  const r2 = await page();
  const html1 = await r1.text();
  const nonce1 = html1.match(/nonce="([^"]+)"/)[1];
  const nonce2 = (await r2.text()).match(/nonce="([^"]+)"/)[1];
  assert.notEqual(nonce1, nonce2, 'each response gets its own nonce');
  assert.ok(r1.headers.get('content-security-policy').includes(`'nonce-${nonce1}'`));
  assert.match(r1.headers.get('cache-control'), /no-store/);
  assert.equal(r1.headers.get('x-frame-options'), 'DENY');
  assert.equal(r1.headers.get('x-content-type-options'), 'nosniff');
  cases++;

  // Link-preview bots and non-GET requests pass through untouched (vercel.json's /share rewrite).
  globalThis.fetch = async () => { throw new Error('must not fetch'); };
  const bot = await middleware(new Request('https://www.scorpio.co.zw/p/item', { headers: { 'user-agent': 'WhatsApp/2.23' } }));
  assert.equal(bot.headers.get('x-middleware-next'), '1');
  const post = await middleware(new Request('https://www.scorpio.co.zw/login', { method: 'POST' }));
  assert.equal(post.headers.get('x-middleware-next'), '1');
  cases++;

  // If the shell can't be read, fall back to the static page (and its vercel.json CSP).
  // A protected preview redirects to a sign-in page: never serve that, never follow it.
  globalThis.fetch = async (url, opts) => {
    assert.equal(opts.redirect, 'manual');
    return new Response(null, { status: 302, headers: { location: 'https://vercel.com/sso-api' } });
  };
  assert.equal((await middleware(new Request('https://www.scorpio.co.zw/login'))).headers.get('x-middleware-next'), '1');
  // A 200 that isn't our shell (some other HTML) is not served with our nonce either.
  globalThis.fetch = async () => new Response('<html><head></head><body>Sign in</body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  assert.equal((await middleware(new Request('https://www.scorpio.co.zw/login'))).headers.get('x-middleware-next'), '1');
  globalThis.fetch = async () => new Response(SHELL, { status: 200, headers: { 'content-type': 'application/json' } });
  assert.equal((await middleware(new Request('https://www.scorpio.co.zw/login'))).headers.get('x-middleware-next'), '1');
  globalThis.fetch = async () => new Response('nope', { status: 500 });
  assert.equal((await middleware(new Request('https://www.scorpio.co.zw/'))).headers.get('x-middleware-next'), '1');
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.equal((await middleware(new Request('https://www.scorpio.co.zw/'))).headers.get('x-middleware-next'), '1');
  cases++;

  // Matcher: page routes yes; API, uploads, build output and files no.
  const re = new RegExp(`^${config.matcher[0].replace('/(', '/(?:')}$`);
  for (const p of ['/', '/login', '/forgot-password', '/reset-password', '/creator/abc', '/discover']) assert.ok(re.test(p), `should match ${p}`);
  for (const p of ['/api/auth/login', '/uploads/x.png', '/assets/index-abc.js', '/brand/mark.svg', '/sw.js', '/index.html', '/favicon.ico', '/manifest.webmanifest']) assert.ok(!re.test(p), `should skip ${p}`);
  cases++;

  console.log(`CSP middleware tests passed (${cases} cases).`);
} finally {
  globalThis.fetch = originalFetch;
}
