// Launch scope: MVP ships with three categories — 'ebooks' and 'templates'
// (single-PDF downloads) plus 'courses' (single-video). Everything else in
// the full CATEGORIES list stays closed for now so there's a small,
// coherent set of things to get right end to end before reopening the
// rest. Flip EBOOKS_ONLY to false to reopen every other category and
// product type — categories.js and everything under services/escrow stay
// untouched either way. The name EBOOKS_ONLY predates courses joining the
// launch set and is kept as-is rather than renamed everywhere it's
// imported; what it actually gates is "the small launch category set."
const { CATEGORIES } = require('./categories');

const LAUNCH_CATEGORY_VALUES = ['ebooks', 'templates', 'courses'];
const EBOOKS_ONLY = true;
const ACTIVE_CATEGORIES = EBOOKS_ONLY ? CATEGORIES.filter(c => LAUNCH_CATEGORY_VALUES.includes(c.value)) : CATEGORIES;
const ACTIVE_CATEGORY_VALUES = ACTIVE_CATEGORIES.map(c => c.value);

module.exports = { EBOOKS_ONLY, ACTIVE_CATEGORIES, ACTIVE_CATEGORY_VALUES };
