const DEFAULT_TIMEOUT_MS = 15000;
// Only a few retries, spaced out — this is riding out a bad connection for
// a few seconds, not masking a server that's actually down.
const RETRY_DELAYS_MS = [500, 1500, 3000];
const CSRF_TOKEN_CACHE_MS = 5 * 60 * 1000;
let csrfTokenPromise = null;
let csrfTokenFetchedAt = 0;

function invalidateCsrfToken() {
  csrfTokenPromise = null;
  csrfTokenFetchedAt = 0;
}

function getCsrfToken() {
  if (!csrfTokenPromise || Date.now() - csrfTokenFetchedAt >= CSRF_TOKEN_CACHE_MS) {
    csrfTokenPromise = (async () => {
      let response;
      for (let attempt = 0; ; attempt++) {
        try {
          response = await fetchWithTimeout('/api/csrf-token', {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store'
          }, DEFAULT_TIMEOUT_MS);
          break;
        } catch (error) {
          if (attempt >= RETRY_DELAYS_MS.length) throw connectionError();
          await sleep(RETRY_DELAYS_MS[attempt]);
        }
      }

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.csrfToken) throw new Error(data?.error || 'Could not prepare this request.');
      csrfTokenFetchedAt = Date.now();
      return data.csrfToken;
    })()
      .catch(error => {
        invalidateCsrfToken();
        throw error;
      });
  }
  return csrfTokenPromise;
}

function notifyConnectionError() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('scorpio:connection-error'));
}

function notifyConnectionRestored() {
  if (typeof window !== 'undefined' && navigator.onLine) window.dispatchEvent(new Event('scorpio:connection-restored'));
}

function connectionError() {
  notifyConnectionError();
  return new Error(navigator.onLine
    ? "We couldn't reach SCORPIO. Your internet may still be working; please try again."
    : "You're offline right now. Reconnect to continue.");
}

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
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutError = new Error('The server took too long to respond. Please try again.');
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function request(path, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, headers } = {}) {
  const isForm = body instanceof FormData;
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const options = {
    method,
    credentials: 'include',
    // headers is additive (e.g. the admin API's x-admin-key below) — merged
    // over the JSON default rather than replacing it, so an admin call
    // sending a plain object body still gets Content-Type: application/json
    // for free, and every existing call site (which never passes headers)
    // is completely unaffected by this.
    headers: isForm ? { ...(headers) } : { ...(headers), 'Content-Type': 'application/json' },
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined
  };

  if (mutating) options.headers['X-CSRF-Token'] = await getCsrfToken();

  // Only GET is safe to silently retry. A dropped POST/PATCH/DELETE might
  // already have succeeded server-side before the response made it back —
  // blindly retrying those risks a real duplicate (a second order placed,
  // a second file uploaded), not just a harmless repeated read. A flaky
  // connection is exactly the case this needs to survive rather than fail
  // fast on, but only where retrying is actually safe.
  const maxNetworkAttempts = method === 'GET' ? RETRY_DELAYS_MS.length + 1 : 1;
  let networkAttempt = 0;
  let csrfRetried = false;

  while (true) {
    networkAttempt++;
    let res;
    try {
      res = await fetchWithTimeout(path, options, timeoutMs);
    } catch (err) {
      // A real network failure (dropped connection, timeout, DNS hiccup) —
      // not a response the server actually sent. Worth retrying. A 4xx/5xx
      // the server DID respond with (handled below, outside this catch)
      // is never retried — retrying won't change a wrong password or a
      // sold-out product.
      if (method === 'GET' && networkAttempt < maxNetworkAttempts) {
        await sleep(RETRY_DELAYS_MS[networkAttempt - 1]);
        continue;
      }
      throw connectionError();
    }
    const data = await res.json().catch(() => null);
    if (mutating && res.status === 403 && data?.error === 'That request expired. Refresh the page and try again.' && !csrfRetried) {
      csrfRetried = true;
      invalidateCsrfToken();
      options.headers['X-CSRF-Token'] = await getCsrfToken();
      continue;
    }
    if (!res.ok) throw new Error(data?.error || 'Something went wrong.');
    notifyConnectionRestored();
    return data;
  }
}

export const api = {
  get: (path) => request(path),
  warmup: () => getCsrfToken(),
  // timeoutMs is optional and only worth overriding for a request that's
  // genuinely expected to take longer than the 15s default — e.g. a
  // checkout POST that waits on Dischub triggering a real EcoCash prompt,
  // where the default would abort (and report "failed") a request that
  // was actually still working.
  post: (path, body, timeoutMs) => request(path, { method: 'POST', body, ...(timeoutMs && { timeoutMs }) }),
  patch: (path, body, timeoutMs) => request(path, { method: 'PATCH', body, ...(timeoutMs && { timeoutMs }) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  uploadWithProgress
};

// The blog admin pages' own calls — every /api/blog/admin/* route checks
// this exact header (see routes/admin.js's requireAdmin, reused by
// routes/blog.js), not a session cookie, there's no admin login to have
// one. `key` is passed in by the caller each time (see lib/adminAuth.js
// for where it actually lives) rather than this module reaching into
// storage itself, so api.js stays a plain HTTP helper, not something that
// needs to know admin auth exists.
// Real upload progress (0-100), for a real reason: a product's cover is
// already compressed client-side before this ever runs (see
// ImageCropper.jsx, capped to 1600px), but the actual deliverable
// (a PDF, or for a course a real video file, up to 500MB — see
// routes/products.js's upload limits) isn't, and genuinely can take real
// time to leave a slow connection. fetch() has no broadly-reliable way to
// report upload progress; XMLHttpRequest does. A static "Publishing…"
// with zero feedback for that whole stretch reads as broken even when
// it's working — this is what actually fixes that, not a faster server
// (the server side of a product publish is already fast, confirmed
// directly: single-digit milliseconds internally).
function uploadWithProgress(path, method, formData, onProgress, timeoutMs = 120000, headers = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, path);
    xhr.withCredentials = true;
    xhr.timeout = timeoutMs;
    Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON error page, data stays null */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        notifyConnectionRestored();
        resolve(data);
      }
      else reject(new Error(data?.error || 'Something went wrong.'));
    };
    xhr.onerror = () => {
      if (!navigator.onLine) {
        reject(connectionError());
        return;
      }
      reject(new Error('The upload connection was interrupted. The server or its proxy may have closed the connection; try again.'));
    };
    xhr.ontimeout = () => reject(new Error("That's taking too long. Check your connection and try again."));
    getCsrfToken()
      .then(token => {
        xhr.setRequestHeader('X-CSRF-Token', token);
        xhr.send(formData);
      })
      .catch(reject);
  });
}
