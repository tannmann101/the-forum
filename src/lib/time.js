// time.js
// Timestamps are stored as epoch milliseconds (Date.now()), same as the
// sibling apps store updatedAt -- sortable, comparable, and no Firestore
// Timestamp objects leaking into render code.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// "Every item shows author name + relative timestamp" -- this is that
// timestamp. It stays relative while relative is actually more useful than
// a date (under a week), then falls back to a real date, because "43 days
// ago" is a worse answer than "Mar 4".
export function relativeTime(ms, now = Date.now()) {
  if (!ms) return '';
  const delta = now - ms;
  if (delta < 45 * 1000) return 'just now';
  if (delta < HOUR) return `${Math.round(delta / MINUTE)}m ago`;
  if (delta < DAY) return `${Math.round(delta / HOUR)}h ago`;
  if (delta < 2 * DAY) return 'yesterday';
  if (delta < 7 * DAY) return `${Math.floor(delta / DAY)}d ago`;

  const date = new Date(ms);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}

export function absoluteTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Local-time YYYY-MM-DD. Deliberately not toISOString().slice(0,10), which
// is UTC -- an evening post would land on the wrong day on the chart and in
// a date-range filter.
export function dayKey(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Start/end of a local day for a YYYY-MM-DD filter bound. The end bound is
// inclusive: picking the same date for "from" and "to" should show that
// whole day, not an empty result.
export function startOfDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

export function endOfDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

export function weekKey(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // back up to Sunday
  return dayKey(d.getTime());
}

export function monthKey(ms) {
  return dayKey(ms).slice(0, 7);
}
