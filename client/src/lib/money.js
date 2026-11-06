const SYMBOLS = { USD: '$', ZWG: 'ZiG ' };

export function formatMoney(minor, currency = 'USD') {
  const symbol = SYMBOLS[currency] || '';
  return `${symbol}${(minor / 100).toFixed(2)}`;
}

// USD and ZiG are different money, so totals are listed side by side, never added.
export function formatTotals(totals) {
  const entries = Object.entries(totals || {}).filter(([, minor]) => minor > 0);
  if (entries.length === 0) return formatMoney(0, 'USD');
  return entries.map(([currency, minor]) => formatMoney(minor, currency)).join(' + ');
}
