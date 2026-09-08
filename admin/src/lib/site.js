// This admin app runs on its own subdomain (admin.scorpio.co.zw), so links
// out to a creator's storefront or a product page have to be real
// cross-origin URLs (a plain <a>), not react-router's <Link> — there's no
// shared client-side router between the two apps.
export const SITE_ORIGIN = 'https://scorpio.co.zw';
