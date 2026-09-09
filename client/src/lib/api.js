const DEFAULT_TIMEOUT_MS = 15000;
// Only a few retries, spaced out — this is riding out a bad connection for
// a few seconds, not masking a server that's actually down.
const RETRY_DELAYS_MS = [500, 1500, 3000];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// AbortController-based timeout — without this, a request on a genuinely
// dead connection just hangs forever instead of ever reaching the retry
// logic below.
async function fetchWithTimeout(path, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(path, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function request(path, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const isForm = body instanceof FormData;
  const options = {
    method,
    credentials: 'include',
    headers: isForm ? undefined : { 'Content-Type': 'application/json' },
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined
  };

  // Only GET is safe to silently retry. A dropped POST/PATCH/DELETE might
  // already have succeeded server-side before the response made it back —
  // blindly retrying those risks a real duplicate (a second order placed,
  // a second file uploaded), not just a harmless repeated read. A flaky
  // connection is exactly the case this needs to survive rather than fail
  // fast on, but only where retrying is actually safe.
  const maxAttempts = method === 'GET' ? RETRY_DELAYS_MS.length + 1 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res;
    try {
      res = await fetchWithTimeout(path, options, timeoutMs);
    } catch (err) {
      // A real network failure (dropped connection, timeout, DNS hiccup) —
      // not a response the server actually sent. Worth retrying. A 4xx/5xx
      // the server DID respond with (handled below, outside this catch)
      // is never retried — retrying won't change a wrong password or a
      // sold-out product.
      if (attempt < maxAttempts - 1) { await sleep(RETRY_DELAYS_MS[attempt]); continue; }
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'Something went wrong.');
    return data;
  }
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' })
};
