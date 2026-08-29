import { CATEGORIES } from './categories.js';

// Mirrors src/lib/launchScope.js on the backend — 'ebooks' and 'templates'
// (single-PDF) plus 'courses' (single-video) for launch. Flip EBOOKS_ONLY
// back to false to reopen every other category and product type in the UI.
const LAUNCH_CATEGORY_VALUES = ['ebooks', 'templates', 'courses'];
export const EBOOKS_ONLY = true;
export const ACTIVE_CATEGORIES = EBOOKS_ONLY ? CATEGORIES.filter(c => LAUNCH_CATEGORY_VALUES.includes(c.value)) : CATEGORIES;
