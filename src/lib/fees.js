// Single source of truth for the platform's cut. wallet.js and insights.js
// both need the same "gross minus fee" math (available balance) — living
// here once instead of as duplicated constants stops the two from quietly
// drifting apart.
const DEFAULT_PLATFORM_FEE_PERCENT = 8;
const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT) || DEFAULT_PLATFORM_FEE_PERCENT;

function feeFor(grossMinor) {
  return Math.round(grossMinor * (PLATFORM_FEE_PERCENT / 100));
}

function netOf(grossMinor) {
  const fee = feeFor(grossMinor);
  return { fee_minor: fee, net_minor: Math.max(0, grossMinor - fee) };
}

module.exports = { PLATFORM_FEE_PERCENT, feeFor, netOf };
