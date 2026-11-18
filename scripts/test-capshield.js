const assert = require('node:assert/strict');
const verifyCapShield = require('../src/middleware/capShield');

process.env.NODE_ENV = 'production';
process.env.CAP_SHIELD_SECRET = 'unit-test-secret';
const originalFetch = global.fetch;
const quiet = { error: console.error, warn: console.warn };

async function invoke(token, fetchImpl) {
  global.fetch = fetchImpl;
  let nextCalled = false;
  let statusCode = 200;
  let body = null;
  const req = { body: token === undefined ? {} : { 'cap-token': token } };
  const res = {
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; }
  };
  await verifyCapShield(req, res, () => { nextCalled = true; });
  return { nextCalled, statusCode, body };
}

// Responses shaped exactly like CapShield's /v1/siteverify.
const reply = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

async function expectRejected(name, fetchImpl, status) {
  const result = await invoke(name, fetchImpl);
  assert.equal(result.nextCalled, false, `${name}: must never continue`);
  assert.equal(result.statusCode, status, `${name}: expected ${status}, got ${result.statusCode}`);
  return result;
}

async function main() {
  console.error = () => {};
  console.warn = () => {};
  let cases = 0;
  try {
    const ok = await invoke('valid-token', async (url, options) => {
      assert.equal(url, 'https://capshield.vercel.app/v1/siteverify');
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), { secret: 'unit-test-secret', response: 'valid-token' });
      return { ok: true, status: 200, json: async () => ({ success: true, challenge_ts: new Date().toISOString() }) };
    });
    assert.equal(ok.nextCalled, true, 'valid token should continue'); cases++;

    await expectRejected(undefined, async () => { throw new Error('fetch must not run'); }, 403); cases++;
    await expectRejected('x'.repeat(5000), async () => { throw new Error('fetch must not run'); }, 403); cases++;

    // Token problems are the visitor's to retry: 403, not "unavailable".
    const used = await expectRejected('used-token', reply(404, { success: false, error: 'Token not found or already used' }), 403); cases++;
    assert.equal(used.body.code, 'captcha_failed');
    await expectRejected('expired-token', reply(403, { success: false, error: 'Token expired' }), 403); cases++;
    await expectRejected('malformed-token', reply(400, { success: false, error: 'Missing secret or response' }), 403); cases++;
    await expectRejected('policy-blocked', reply(200, { success: false, error: 'blocked_by_policy', decision: { action: 'block' } }), 403); cases++;
    await expectRejected('success-not-true', reply(200, { success: 'true' }), 403); cases++;

    // Replay: the first use passes, the second is refused (siteverify consumes tokens).
    let seen = false;
    const replay = async () => {
      const status = seen ? 404 : 200;
      const body = seen ? { success: false, error: 'Token not found or already used' } : { success: true };
      seen = true;
      return { ok: status === 200, status, json: async () => body };
    };
    assert.equal((await invoke('replayed', replay)).nextCalled, true);
    await expectRejected('replayed', replay, 403); cases++;

    // Our misconfiguration or their outage: fail closed with 503.
    await expectRejected('bad-secret', reply(403, { success: false, error: 'Invalid site key or secret' }), 503); cases++;
    await expectRejected('service-error', reply(502, null), 503); cases++;
    await expectRejected('non-json-200', async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } }), 503); cases++;
    await expectRejected('network-error', async () => { throw new Error('network unavailable'); }, 503); cases++;
    await expectRejected('timeout', async () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; }, 503); cases++;

    delete process.env.CAP_SHIELD_SECRET;
    await expectRejected('no-secret', async () => { throw new Error('fetch must not run'); }, 503); cases++;

    console.log(`CapShield middleware tests passed (${cases} cases).`);
  } finally {
    global.fetch = originalFetch;
    Object.assign(console, quiet);
    delete process.env.CAP_SHIELD_SECRET;
  }
}

main().catch(error => { Object.assign(console, quiet); console.error(error); process.exitCode = 1; });
