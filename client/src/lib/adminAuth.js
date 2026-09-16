// The blog admin pages' only access control: the same ADMIN_KEY every
// /api/admin/* route has always required (see routes/admin.js —
// there are no real admin accounts/roles in this app), now held in the
// browser for the first time instead of only ever being typed into a
// terminal. Kept in localStorage (not sessionStorage) deliberately — the
// tradeoff (this key sits in browser storage indefinitely on this device)
// was discussed and accepted in favor of not re-entering it every visit.
const STORAGE_KEY = 'scorpio_admin_key';

export function getAdminKey() {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}

export function setAdminKey(key) {
  try { localStorage.setItem(STORAGE_KEY, key); } catch { /* private mode etc — key just won't persist */ }
}

export function clearAdminKey() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing to clean up if storage never worked */ }
}
