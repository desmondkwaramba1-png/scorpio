const assert = require('node:assert/strict');
const verifyCapShield = require('../src/middleware/capShield');

process.env.NODE_ENV = 'production';
process.env.CAP_SHIELD_SECRET = 'unit-test-secret';
const originalFetch = global.fetch;

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

async function main() {
  try {
    let result = await invoke('valid-token', async (url, options) => {
      assert.equal(url, 'https://capshield.vercel.app/v1/siteverify');
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), { secret: 'unit-test-secret', response: 'valid-token' });
      return { ok: true, json: async () => ({ success: true }) };
    });
    assert.equal(result.nextCalled, true, 'valid token should continue');

    result = await invoke(undefined, async () => { throw new Error('fetch must not run'); });
    assert.equal(result.statusCode, 403, 'missing token should be rejected');
    assert.equal(result.nextCalled, false);

    result = await invoke('invalid-token', async () => ({ ok: true, json: async () => ({ success: false }) }));
    assert.equal(result.statusCode, 403, 'invalid token should be rejected');
    assert.equal(result.nextCalled, false);

    result = await invoke('service-error', async () => ({ ok: false, status: 502 }));
    assert.equal(result.statusCode, 503, 'verification service errors should fail closed');
    assert.equal(result.nextCalled, false);

    result = await invoke('network-error', async () => { throw new Error('network unavailable'); });
    assert.equal(result.statusCode, 503, 'network errors should fail closed');
    assert.equal(result.nextCalled, false);

    console.log('CapShield middleware tests passed (5 cases).');
  } finally {
    global.fetch = originalFetch;
    delete process.env.CAP_SHIELD_SECRET;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
