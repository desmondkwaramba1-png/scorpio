// The real browsing dimension for the marketplace — what a product IS about,
// not `type` (single/serial), which only describes its delivery pattern.
const CATEGORIES = [
  { value: 'ebooks', label: 'Ebooks' },
  { value: 'templates', label: 'Guides & templates' },
  { value: 'courses', label: 'Courses & coaching' },
  { value: 'music', label: 'Music & audio' },
  { value: 'video', label: 'Video & film' },
  { value: 'design', label: 'Design & templates' },
  { value: 'software', label: 'Software & apps' },
  { value: 'photography', label: 'Photography' },
  { value: 'writing', label: 'Writing & scripts' },
  { value: 'business', label: 'Business & finance' },
  { value: 'other', label: 'Other' }
];

const CATEGORY_VALUES = CATEGORIES.map(c => c.value);
const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));

module.exports = { CATEGORIES, CATEGORY_VALUES, CATEGORY_LABELS };
