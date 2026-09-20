// Unit tests for the pure Activity Log logic -- filtering, bucketing, the
// engagement series and the CSV shape. Same split as the Household Ledger's
// test-math.mjs: anything the page computes lives in src/lib/activity.js so
// it can be checked here without a browser or a Firestore emulator.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL,
  CSV_HEADERS,
  activityCSVRows,
  engagementSeries,
  filterActivity,
  peopleIn,
  totalsByPerson,
} from '../src/lib/activity.js';
import { toCSV } from '../src/lib/csv.js';
import { dayKey, endOfDay, relativeTime, startOfDay, weekKey, monthKey } from '../src/lib/time.js';

// A fixed local-time date so these assertions don't drift with the clock.
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();

const entry = (over = {}) => ({
  id: Math.random().toString(36).slice(2),
  actorId: 'u-tanner',
  actorName: 'Tanner',
  action: 'post.create',
  targetType: 'post',
  targetId: 'p1',
  breadcrumb: 'House › The fence',
  categoryId: 'c-house',
  createdAt: at(2026, 3, 10),
  ...over,
});

const LOG = [
  entry({ createdAt: at(2026, 3, 10), action: 'thread.create', targetType: 'thread' }),
  entry({ createdAt: at(2026, 3, 11) }),
  entry({ createdAt: at(2026, 3, 12), actorId: 'u-roc', actorName: 'Rochelle', action: 'comment.create' }),
  entry({ createdAt: at(2026, 4, 2), actorId: 'u-roc', actorName: 'Rochelle', categoryId: 'c-trips' }),
  entry({ createdAt: at(2026, 4, 3), action: 'category.rename', targetType: 'category', categoryId: 'c-trips' }),
];

test('filterActivity returns everything, newest first, with no filters', () => {
  const rows = filterActivity(LOG, {});
  assert.equal(rows.length, 5);
  assert.equal(rows[0].createdAt, at(2026, 4, 3));
  assert.equal(rows.at(-1).createdAt, at(2026, 3, 10));
});

test('filterActivity filters by person', () => {
  const rows = filterActivity(LOG, { person: 'u-roc' });
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.actorName === 'Rochelle'));
});

test('filterActivity filters by category', () => {
  assert.equal(filterActivity(LOG, { categoryId: 'c-trips' }).length, 2);
  assert.equal(filterActivity(LOG, { categoryId: 'c-house' }).length, 3);
});

test('filterActivity filters by action type', () => {
  const rows = filterActivity(LOG, { action: 'post.create' });
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.action === 'post.create'));
});

test('filterActivity date range is inclusive on both ends', () => {
  const sameDay = filterActivity(LOG, { from: '2026-03-11', to: '2026-03-11' });
  assert.equal(sameDay.length, 1, 'a single-day range should include that whole day');

  const span = filterActivity(LOG, { from: '2026-03-11', to: '2026-03-12' });
  assert.equal(span.length, 2);
});

test('filterActivity ANDs its filters together', () => {
  const rows = filterActivity(LOG, { person: 'u-roc', categoryId: 'c-house', action: ALL });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, 'comment.create');
});

test('peopleIn is de-duplicated and name-sorted for stable colors', () => {
  const people = peopleIn(LOG);
  assert.deepEqual(people.map((p) => p.name), ['Rochelle', 'Tanner']);
});

test('engagementSeries buckets per person and totals correctly', () => {
  const series = engagementSeries(LOG, 'month');
  assert.deepEqual(series.rows.map((r) => r.key), ['2026-03', '2026-04']);

  const march = series.rows[0];
  assert.equal(march.total, 3);
  assert.equal(march.counts['u-tanner'], 2);
  assert.equal(march.counts['u-roc'], 1);

  const april = series.rows[1];
  assert.equal(april.total, 2);
  assert.equal(april.counts['u-roc'], 1);
  assert.equal(series.max, 3);
});

test('engagementSeries day buckets keep separate days separate', () => {
  const series = engagementSeries(LOG, 'day');
  assert.equal(series.rows.length, 5);
  assert.ok(series.rows.every((r) => r.total === 1));
});

test('engagementSeries on an empty set is empty rather than throwing', () => {
  const series = engagementSeries([], 'week');
  assert.deepEqual(series.rows, []);
  assert.equal(series.max, 0);
  assert.deepEqual(series.people, []);
});

test('totalsByPerson counts the filtered slice', () => {
  const totals = totalsByPerson(filterActivity(LOG, { categoryId: 'c-house' }));
  assert.deepEqual(
    totals.map((t) => [t.name, t.count]),
    [['Rochelle', 1], ['Tanner', 2]],
  );
});

test('activityCSVRows matches the header width and labels actions', () => {
  const rows = activityCSVRows(filterActivity(LOG, { action: 'category.rename' }), () => 'Renamed category');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].length, CSV_HEADERS.length);
  assert.equal(rows[0][2], 'Renamed category');
  assert.equal(rows[0][3], 'category.rename');
  assert.equal(rows[0][4], 'House › The fence');
});

test('dayKey is local time, not UTC', () => {
  // 11pm local on the 10th must not roll forward to the 11th.
  assert.equal(dayKey(at(2026, 3, 10, 23)), '2026-03-10');
  assert.equal(dayKey(at(2026, 3, 10, 0)), '2026-03-10');
});

test('startOfDay/endOfDay bracket exactly one local day', () => {
  const start = startOfDay('2026-03-10');
  const end = endOfDay('2026-03-10');
  assert.ok(end - start === 86_400_000 - 1);
  assert.equal(dayKey(start), '2026-03-10');
  assert.equal(dayKey(end), '2026-03-10');
});

test('weekKey collapses a week onto its Sunday', () => {
  // 2026-03-10 is a Tuesday; its week starts Sunday 2026-03-08.
  assert.equal(weekKey(at(2026, 3, 10)), '2026-03-08');
  assert.equal(weekKey(at(2026, 3, 14)), '2026-03-08');
  assert.equal(weekKey(at(2026, 3, 15)), '2026-03-15');
});

test('monthKey is YYYY-MM', () => {
  assert.equal(monthKey(at(2026, 3, 31)), '2026-03');
});

test('relativeTime degrades from minutes to a real date', () => {
  const now = at(2026, 3, 20, 12);
  assert.equal(relativeTime(now - 10_000, now), 'just now');
  assert.equal(relativeTime(now - 5 * 60_000, now), '5m ago');
  assert.equal(relativeTime(now - 3 * 3_600_000, now), '3h ago');
  assert.equal(relativeTime(now - 30 * 3_600_000, now), 'yesterday');
  assert.equal(relativeTime(now - 4 * 86_400_000, now), '4d ago');
  assert.match(relativeTime(now - 60 * 86_400_000, now), /Jan/);
});

test('toCSV quotes cells containing commas, quotes or newlines', () => {
  const csv = toCSV(['A', 'B'], [
    ['plain', 'has, a comma'],
    ['say "hi"', 'line\nbreak'],
    [null, undefined],
  ]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'A,B');
  assert.equal(lines[1], 'plain,"has, a comma"');
  // The embedded newline stays inside its quoted cell -- only the \r\n row
  // separator ends a record, which is what a spreadsheet expects.
  assert.equal(lines[2], '"say ""hi""","line\nbreak"');
  assert.equal(lines[3], ',', 'null/undefined become empty cells, not the strings');
  assert.equal(lines.length, 4);
});

test('toCSV survives a breadcrumb with a comma in a category name', () => {
  const rows = activityCSVRows(
    [{ createdAt: 0, actorName: 'Tanner', action: 'post.create', breadcrumb: 'House, Yard › Fence', targetType: 'post', targetId: 'p1' }],
    () => 'Added post',
  );
  assert.match(toCSV(CSV_HEADERS, rows), /"House, Yard › Fence"/);
});
