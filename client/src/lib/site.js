// The public host to show as "your storefront link" — reads the real host
// wherever this happens to actually be running (localhost:5173 in dev,
// whatever the real domain is once deployed) instead of a hardcoded name
// that's wrong everywhere except one specific, unconfigured deployment.
export const SITE_HOST = window.location.host;
export const SITE_ORIGIN = window.location.origin;
