// Money lives everywhere else as integer minor units (cents). These are the
// only two places a float is allowed to touch a price: converting a form
// input in, and formatting a number for display.

function toMinor(amount) {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function fromMinor(minor) {
  return minor / 100;
}

const SYMBOLS = { USD: '$', ZWG: 'ZiG ' };

function format(minor, currency = 'USD') {
  const symbol = SYMBOLS[currency] || '';
  return `${symbol}${fromMinor(minor).toFixed(2)}`;
}

module.exports = { toMinor, fromMinor, format };
