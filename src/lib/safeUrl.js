// Seller-supplied links (a product's external deliverable, a serial issue, a
// service delivery) are rendered to buyers as <a href> and window.open()
// targets. Without a scheme check, "javascript:..." is stored XSS running on
// the marketplace's own origin, so only http(s) is ever accepted.
function normalizeExternalUrl(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value.length > 2048) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return url.toString();
}

module.exports = { normalizeExternalUrl };
