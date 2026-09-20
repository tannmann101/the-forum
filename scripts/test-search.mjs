// Unit tests for the search logic. Pure functions, no emulator and no
// browser -- same split as test-activity.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PER_GROUP, flatten, matches, searchForum, snippet, tokenize } from '../src/lib/search.js';

const at = (d) => new Date(2026, 2, d, 12).getTime();

const DATA = {
  categories: [
    { id: 'c1', name: 'House & Yard', createdAt: at(1) },
    { id: 'c2', name: 'Trips', createdAt: at(2), archived: true },
  ],
  threads: [
    { id: 't1', categoryId: 'c1', title: 'The back fence', createdByName: 'Tanner', createdAt: at(3) },
    { id: 't2', categoryId: 'c2', title: 'Summer road trip', createdByName: 'Rochelle', createdAt: at(4) },
  ],
  posts: [
    { id: 'p1', threadId: 't1', categoryId: 'c1', authorName: 'Tanner', body: 'The fence leans further every winter.', createdAt: at(5) },
    { id: 'p2', threadId: 't1', categoryId: 'c1', authorName: 'Tanner', body: 'Quote came back at $2,400.', createdAt: at(6) },
  ],
  comments: [
    { id: 'cm1', threadId: 't1', postId: 'p1', categoryId: 'c1', authorName: 'Rochelle', body: 'Replace it, do not patch it.', createdAt: at(7) },
    { id: 'cm2', threadId: 't1', postId: 'p1', categoryId: 'c1', authorName: 'Rochelle', body: '[deleted]', deleted: true, createdAt: at(8) },
  ],
  replies: [
    { id: 'r1', commentId: 'cm1', threadId: 't1', postId: 'p1', categoryId: 'c1', authorName: 'Tanner', body: 'Agreed, replacing the fence it is.', createdAt: at(9) },
  ],
};

test('an empty query returns nothing rather than everything', () => {
  for (const q of ['', '   ', '\t']) {
    const r = searchForum(q, DATA);
    assert.equal(r.total, 0);
    assert.deepEqual(r.groups, []);
  }
});

test('matching is case-insensitive and partial-word', () => {
  assert.ok(matches('The back fence', tokenize('FENCE')));
  assert.ok(matches('The back fence', tokenize('fenc')));
  assert.ok(!matches('The back fence', tokenize('gate')));
});

test('all tokens must appear, in any order', () => {
  assert.ok(matches('Agreed, replacing the fence it is.', tokenize('fence agreed')));
  assert.ok(!matches('Agreed, replacing the fence it is.', tokenize('fence gate')));
});

test('results are grouped by type, in structural order', () => {
  // "fence" hits a thread title, a post body and a reply body, but no
  // comment -- so the comment group is absent rather than empty.
  const { groups } = searchForum('fence', DATA);
  assert.deepEqual(groups.map((g) => g.type), ['thread', 'post', 'reply']);
});

test('a query hits every layer it should', () => {
  const { groups, total } = searchForum('fence', DATA);
  const byType = Object.fromEntries(groups.map((g) => [g.type, g.items]));
  assert.equal(byType.thread.length, 1, 'thread title');
  assert.equal(byType.post.length, 1, 'post body');
  assert.equal(byType.reply.length, 1, 'reply body');
  assert.equal(total, 3);
});

test('categories match on their name', () => {
  const { groups } = searchForum('yard', DATA);
  assert.equal(groups[0].type, 'category');
  assert.equal(groups[0].items[0].title, 'House & Yard');
});

test('every result carries what navigation needs', () => {
  const { groups } = searchForum('patch', DATA);
  const hit = flatten(groups)[0];
  assert.equal(hit.type, 'comment');
  assert.equal(hit.threadId, 't1', 'which thread to open');
  assert.equal(hit.focusId, 'cm1', 'which element to focus once open');
  assert.equal(hit.categoryId, 'c1');
  assert.equal(hit.where, 'House & Yard › The back fence', 'human-readable location');
});

test('a category result has no thread to open', () => {
  const hit = flatten(searchForum('trips', DATA).groups)[0];
  assert.equal(hit.type, 'category');
  assert.equal(hit.threadId, null);
  assert.equal(hit.focusId, null);
  assert.equal(hit.categoryId, 'c2');
});

test('archived things are found, and flagged as archived', () => {
  const hit = flatten(searchForum('trips', DATA).groups)[0];
  assert.equal(hit.archived, true);
});

test('a tombstoned comment only matches someone searching for the tombstone', () => {
  assert.equal(searchForum('patch', DATA).groups.find((g) => g.type === 'comment').items.length, 1);
  const deleted = flatten(searchForum('deleted', DATA).groups);
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].deleted, true);
});

test('snippet marks the match and pads around it', () => {
  const parts = snippet('The fence leans further every winter.', tokenize('leans'));
  assert.equal(parts.filter((p) => p.match).map((p) => p.text).join(''), 'leans');
  assert.equal(parts.map((p) => p.text).join('').replace(/…/g, ''), 'The fence leans further every winter.');
});

test('snippet marks every token of a multi-word query', () => {
  const parts = snippet('The fence leans further every winter.', tokenize('fence winter'));
  assert.deepEqual(parts.filter((p) => p.match).map((p) => p.text), ['fence', 'winter']);
});

test('snippet elides a long body around the hit', () => {
  const long = `${'x'.repeat(300)} needle ${'y'.repeat(300)}`;
  const parts = snippet(long, tokenize('needle'));
  const text = parts.map((p) => p.text).join('');
  assert.ok(text.startsWith('…'), 'elided at the front');
  assert.ok(text.endsWith('…'), 'elided at the end');
  assert.ok(text.length < 150, `kept short, got ${text.length}`);
  assert.ok(text.includes('needle'));
});

test('snippet never throws on missing or empty text', () => {
  assert.doesNotThrow(() => snippet(undefined, tokenize('x')));
  assert.doesNotThrow(() => snippet('', tokenize('x')));
  assert.doesNotThrow(() => snippet('text', []));
});

test('each group is capped, but reports its true total', () => {
  const many = {
    ...DATA,
    posts: Array.from({ length: MAX_PER_GROUP + 5 }, (_, i) => ({
      id: `p${i}`, threadId: 't1', categoryId: 'c1', authorName: 'Tanner',
      body: `fence note number ${i}`, createdAt: at(10 + i),
    })),
  };
  const group = searchForum('fence note', many).groups.find((g) => g.type === 'post');
  assert.equal(group.items.length, MAX_PER_GROUP, 'capped for display');
  assert.equal(group.total, MAX_PER_GROUP + 5, 'but the real count is reported');
});

test('results are newest-first within a group', () => {
  const group = searchForum('fence', DATA).groups.find((g) => g.type === 'post');
  assert.equal(group.items[0].id, 'p1');
});

test('searching missing collections does not throw', () => {
  assert.doesNotThrow(() => searchForum('anything', {}));
  assert.equal(searchForum('anything', {}).total, 0);
});
