// activity.js
// Pure functions behind the Activity Log page -- filtering, the per-person
// engagement series, and the CSV shape. Kept out of the component (and free
// of any Firestore or DOM reference) so scripts/test-activity.mjs can run
// them under `node --test`, the same split the Household Ledger uses for
// its simulation math.

import { dayKey, weekKey, monthKey, startOfDay, endOfDay } from './time.js';

export const ALL = '__all__';

// Filters are ANDed, and each one is skipped when set to ALL/empty. Sorted
// newest-first because the log is read as "what just happened", not as a
// chronicle from the beginning.
export function filterActivity(entries, { person = ALL, categoryId = ALL, action = ALL, from = '', to = '' } = {}) {
  const fromMs = from ? startOfDay(from) : null;
  const toMs = to ? endOfDay(to) : null;

  return entries
    .filter((e) => {
      if (person !== ALL && e.actorId !== person) return false;
      if (categoryId !== ALL && (e.categoryId || null) !== categoryId) return false;
      if (action !== ALL && e.action !== action) return false;
      if (fromMs !== null && e.createdAt < fromMs) return false;
      if (toMs !== null && e.createdAt > toMs) return false;
      return true;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

// The cast of people who show up in a set of entries, with a stable id ->
// name map. Sorted by name so color assignment (see personColor) is stable
// no matter who happened to post first.
export function peopleIn(entries) {
  const names = new Map();
  for (const e of entries) {
    if (e.actorId && !names.has(e.actorId)) names.set(e.actorId, e.actorName || 'Someone');
  }
  return [...names.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const BUCKETERS = { day: dayKey, week: weekKey, month: monthKey };

export const BUCKETS = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
];

// Per-person activity counts over time: one row per time bucket, one count
// per person, plus the bucket total. Buckets with no activity at all are
// simply absent rather than zero-filled -- a family forum has quiet weeks,
// and a chart of mostly-empty columns hides the shape of the busy ones.
export function engagementSeries(entries, bucket = 'week') {
  const keyFor = BUCKETERS[bucket] || weekKey;
  const people = peopleIn(entries);
  const byBucket = new Map();

  for (const e of entries) {
    if (!e.createdAt) continue;
    const key = keyFor(e.createdAt);
    if (!byBucket.has(key)) {
      byBucket.set(key, { key, total: 0, counts: Object.fromEntries(people.map((p) => [p.id, 0])) });
    }
    const row = byBucket.get(key);
    row.counts[e.actorId] = (row.counts[e.actorId] || 0) + 1;
    row.total += 1;
  }

  return {
    people,
    rows: [...byBucket.values()].sort((a, b) => a.key.localeCompare(b.key)),
    max: Math.max(...[...byBucket.values()].map((r) => r.total), 0),
  };
}

// Totals per person across the filtered set, for the legend.
export function totalsByPerson(entries) {
  const people = peopleIn(entries);
  const counts = Object.fromEntries(people.map((p) => [p.id, 0]));
  for (const e of entries) counts[e.actorId] = (counts[e.actorId] || 0) + 1;
  return people.map((p) => ({ ...p, count: counts[p.id] || 0 }));
}

export const CSV_HEADERS = ['When', 'Who', 'Action', 'What', 'Where', 'Target type', 'Target id'];

// One row per log entry, in the same order the table shows -- an export of
// what you're looking at, not of everything.
export function activityCSVRows(entries, actionLabel) {
  return entries.map((e) => [
    new Date(e.createdAt).toISOString(),
    e.actorName || '',
    actionLabel(e.action),
    e.action,
    e.breadcrumb || '',
    e.targetType || '',
    e.targetId || '',
  ]);
}
