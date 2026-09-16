// Sqlite datetimes come back as "YYYY-MM-DD HH:MM:SS" (no 'T', no zone) —
// Date can't parse that reliably across browsers without the swap below.
function parseSqlDate(sqliteDatetime) {
  return new Date(sqliteDatetime.replace(' ', 'T') + 'Z');
}

// Coarse on purpose — a buyer deciding whether a series is still alive
// needs "about how long," not a precise duration.
export function timeAgo(sqliteDatetime) {
  const then = parseSqlDate(sqliteDatetime).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 3600) return 'just now';
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
