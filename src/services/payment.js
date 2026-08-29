const { fromMinor } = require('../lib/money');

// Real integration: Dischub, direct EcoCash push. This is the seam the
// brief called for — the rest of the app only ever calls
// createOrder()/checkOrderStatus(), never talks to Dischub's HTTP API
// directly, so swapping providers later means changing only this file.
//
// This is the non-redirecting flow: createOrder() sends payment_method +
// payment_details.ecocash_number directly, which makes Dischub push an
// EcoCash prompt straight to the buyer's phone — there is no pay_url, no
// browser redirect, no leaving this site. The money rule that matters most
// still holds exactly as before: a payment is never "paid" because we say
// so. createOrder() only ever reports that Dischub *accepted the order and
// sent the prompt* — checkOrderStatus() (polled from PaymentReturn.jsx) is
// the only source of truth for whether it was actually paid.
//
// Request/response shapes here match Dischub's documented API exactly —
// order_id, sender, recipient, amount, currency, payment_method,
// payment_details for creating an order; order_id, recipient for checking
// status. No redirect_url, callback_url, or mode fields: they're not part
// of this documented flow, so nothing is sent that isn't asked for.

const API_KEY = process.env.DISCHUB_API_KEY;
const RECIPIENT = process.env.DISCHUB_RECIPIENT;
const BASE_URL = process.env.DISCHUB_BASE_URL || 'https://dischub.co.zw';

function headers() {
  return { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY };
}

function isConfigured() {
  return !!(API_KEY && RECIPIENT);
}

// Dischub accepts +263780070488, 0263780070488, or 0780070488 for `sender`,
// and +263780000000 or 0780000000 (no 0263 form) for `ecocash_number` —
// reject anything else up front instead of letting the gateway do it,
// since our error message can be more useful to the buyer than a raw API
// rejection.
const SENDER_PHONE_RE = /^(\+263|0263|0)\d{9}$/;
const ECOCASH_NUMBER_RE = /^(\+263|0)\d{9}$/;
function isValidSenderPhone(phone) {
  return typeof phone === 'string' && SENDER_PHONE_RE.test(phone.replace(/\s+/g, ''));
}

// POST /api/orders/create/ — creates the order and, on success, triggers a
// real EcoCash prompt on the buyer's phone. ecocash_number defaults to the
// same number as sender (the overwhelming common case: the buyer pays with
// their own EcoCash) since the checkout form only collects one phone
// number; it's a separate parameter here only because Dischub's API
// documents it as one.
async function createOrder({ orderId, sender, amountMinor, currency, ecocashNumber }) {
  if (!isConfigured()) {
    return { success: false, error: 'Payment gateway is not configured. Set DISCHUB_API_KEY and DISCHUB_RECIPIENT.' };
  }

  const body = {
    order_id: String(orderId),
    sender,
    recipient: RECIPIENT,
    amount: Number(fromMinor(amountMinor).toFixed(2)),
    currency,
    payment_method: 'ecocash',
    payment_details: { ecocash_number: ecocashNumber || sender }
  };

  let res, data;
  try {
    res = await fetch(`${BASE_URL}/api/orders/create/`, {
      method: 'POST', headers: headers(), body: JSON.stringify(body)
    });
    data = await res.json();
  } catch (err) {
    return { success: false, error: `Could not reach the payment gateway: ${err.message}` };
  }

  if (data.status !== 'success') {
    return { success: false, error: data.message || 'The payment gateway rejected this order.' };
  }

  // ecocash_status is Dischub's own words for "prompt sent, waiting on the
  // subscriber" (documented value: "PENDING SUBSCRIBER VALIDATION") —
  // passed through as-is rather than re-interpreted, since it's purely
  // informational; checkOrderStatus() is still what actually decides paid/
  // failed/pending.
  return { success: true, ecocashStatus: data.ecocash_status };
}

// POST /api/payment/status/3/step/ — the only source of truth for whether
// an order actually got paid. Polled from PaymentReturn.jsx after the
// buyer approves (or ignores) the EcoCash prompt createOrder() triggered.
async function checkOrderStatus(orderId) {
  if (!isConfigured()) {
    return { status: 'error', error: 'Payment gateway is not configured.' };
  }

  let res, data;
  try {
    res = await fetch(`${BASE_URL}/api/payment/status/3/step/`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ order_id: String(orderId), recipient: RECIPIENT })
    });
    data = await res.json();
  } catch (err) {
    return { status: 'error', error: `Could not reach the payment gateway: ${err.message}` };
  }

  if (data.status === 'success' || data.status === 'pending' || data.status === 'failed') {
    return { status: data.status, raw: data };
  }
  // Any error shape (missing order, bad key, etc.) — treat as "not resolved
  // yet" rather than crashing the poll; the raw message is kept for logs.
  return { status: 'error', error: data.message || 'Unknown response from payment gateway.', raw: data };
}

module.exports = { createOrder, checkOrderStatus, isConfigured, isValidSenderPhone };
