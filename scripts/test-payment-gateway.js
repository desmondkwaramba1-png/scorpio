const assert = require('node:assert/strict');

process.env.DISCHUB_API_KEY = 'test-api-key';
process.env.DISCHUB_RECIPIENT = 'test-recipient';
process.env.DISCHUB_BASE_URL = 'https://gateway.example.invalid';

const { createOrder, checkOrderStatus } = require('../src/services/payment');
const originalFetch = global.fetch;

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

async function main() {
  const input = {
    orderId: 'test-order',
    sender: '0780070488',
    amountMinor: 1234,
    currency: 'USD'
  };

  global.fetch = async () => { throw new Error('connection lost'); };
  const networkFailure = await createOrder(input);
  assert.equal(networkFailure.success, false);
  assert.equal(networkFailure.uncertain, true);

  global.fetch = async () => response(503, { status: 'error' });
  const gatewayFailure = await createOrder(input);
  assert.equal(gatewayFailure.success, false);
  assert.equal(gatewayFailure.uncertain, true);

  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => { throw new Error('invalid JSON'); }
  });
  const unreadableResponse = await createOrder(input);
  assert.equal(unreadableResponse.success, false);
  assert.equal(unreadableResponse.uncertain, true);

  global.fetch = async () => response(400, { status: 'error', message: 'Invalid phone' });
  const rejected = await createOrder(input);
  assert.equal(rejected.success, false);
  assert.equal(rejected.uncertain, undefined);

  let sentRequest;
  global.fetch = async (_url, options) => {
    sentRequest = JSON.parse(options.body);
    return response(200, { status: 'success', ecocash_status: 'PENDING SUBSCRIBER VALIDATION' });
  };
  const accepted = await createOrder(input);
  assert.equal(accepted.success, true);
  assert.equal(accepted.ecocashStatus, 'PENDING SUBSCRIBER VALIDATION');
  assert.equal(sentRequest.order_id, input.orderId);
  assert.equal(sentRequest.amount, 12.34);
  assert.equal(sentRequest.payment_method, 'ecocash');
  assert.equal(sentRequest.payment_details.ecocash_number, input.sender);

  global.fetch = async (_url, options) => {
    sentRequest = JSON.parse(options.body);
    return response(200, { status: 'success' });
  };
  const paidStatus = await checkOrderStatus(input.orderId);
  assert.equal(paidStatus.status, 'success');
  assert.equal(sentRequest.order_id, input.orderId);
  assert.equal(sentRequest.recipient, 'test-recipient');

  global.fetch = async () => response(503, { status: 'success' });
  const invalidPaidStatus = await checkOrderStatus(input.orderId);
  assert.equal(invalidPaidStatus.status, 'error');

  console.log('Payment gateway creation, status verification, and uncertain-response checks passed.');
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    global.fetch = originalFetch;
  });
