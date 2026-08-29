// A promo is active if a percentage is set and, for a capped ("first X
// buyers") promo, the cap hasn't been reached yet. A blanket promo
// (discount_limit === null) has no cap and stays active until the seller
// removes it.
function isPromoActive(product) {
  if (!product.discount_percent) return false;
  if (product.discount_limit === null || product.discount_limit === undefined) return true;
  return product.discount_claimed < product.discount_limit;
}

function applyDiscount(priceMinor, discountPercent) {
  return Math.round(priceMinor * (100 - discountPercent) / 100);
}

module.exports = { isPromoActive, applyDiscount };
