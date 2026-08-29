import {
  FiBook, FiFileText, FiMonitor, FiMusic, FiFilm, FiPenTool,
  FiCode, FiCamera, FiEdit3, FiBriefcase, FiGrid
} from 'react-icons/fi';

// Mirrors src/lib/categories.js on the backend — the real browsing
// dimension (what a product IS), separate from `type` (single/serial,
// its delivery pattern).
export const CATEGORIES = [
  { value: 'ebooks', label: 'Ebooks', icon: FiBook },
  { value: 'templates', label: 'Guides & templates', icon: FiFileText },
  { value: 'courses', label: 'Courses & coaching', icon: FiMonitor },
  { value: 'music', label: 'Music & audio', icon: FiMusic },
  { value: 'video', label: 'Video & film', icon: FiFilm },
  { value: 'design', label: 'Design & templates', icon: FiPenTool },
  { value: 'software', label: 'Software & apps', icon: FiCode },
  { value: 'photography', label: 'Photography', icon: FiCamera },
  { value: 'writing', label: 'Writing & scripts', icon: FiEdit3 },
  { value: 'business', label: 'Business & finance', icon: FiBriefcase },
  { value: 'other', label: 'Other', icon: FiGrid }
];

export const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));
