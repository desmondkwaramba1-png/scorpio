const SITE = 'SCORPIO';

// Pages that don't set their own SEO title. Every browser tab should say where
// you are, which is what screen readers announce on navigation too.
const TITLES = [
  [/^\/login/, 'Log in'], [/^\/forgot-password/, 'Reset your password'], [/^\/reset-password/, 'Choose a new password'],
  [/^\/verify-email/, 'Verify your email'], [/^\/check-email/, 'Check your email'], [/^\/terms/, 'Terms'],
  [/^\/privacy/, 'Privacy policy'], [/^\/report/, 'Report an issue'], [/^\/accept-terms/, 'Accept the terms'],
  [/^\/onboarding/, 'Set up your storefront'], [/^\/account/, 'Your library'], [/^\/cart/, 'Your cart'],
  [/^\/checkout/, 'Checkout'], [/^\/payment\/return/, 'Payment status'], [/^\/creators/, 'Creators'],
  [/^\/dashboard\/products\/new/, 'Add a product'], [/^\/dashboard\/products/, 'Your products'], [/^\/dashboard\/orders/, 'Orders'],
  [/^\/dashboard\/reels/, 'Your reels'], [/^\/dashboard\/insights/, 'Insights'], [/^\/dashboard\/wallet/, 'Wallet'],
  [/^\/dashboard\/subscriptions/, 'Subscriptions'], [/^\/dashboard\/blog/, 'Your blog'], [/^\/dashboard\/settings/, 'Settings'],
  [/^\/dashboard/, 'Dashboard'], [/^\/@?[^/]+\/[^/]+\/checkout/, 'Checkout']
];

export function titleForPath(pathname) {
  const match = TITLES.find(([pattern]) => pattern.test(pathname));
  return match ? `${match[1]} | ${SITE}` : null;
}
