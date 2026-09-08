const SYMBOLS = { USD: '$', ZWG: 'ZiG ' };

export function formatMoney(minor, currency = 'USD') {
  const symbol = SYMBOLS[currency] || '';
  return `${symbol}${(minor / 100).toFixed(2)}`;
}
