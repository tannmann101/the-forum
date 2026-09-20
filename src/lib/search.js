// search.js
// Free-text search across everything in the forum. Pure functions, no
// Firestore and no DOM, so scripts/test-search.mjs can exercise them under
// `node --test` -- the same split src/lib/activity.js uses.
//
// The search runs entirely in the browser against the snapshots useForum
// already holds. Firestore has no substring or full-text query, so a
// server-side version would mean a second index (Algolia and friends) for
// a family forum whose entire corpus fits in memory several times over.

// Structural order, matching how the forum nests. Results are grouped in
// this order rather than by score, because "which kind of thing is this"
// is the first question you ask of a result list.
export const RESULT_TYPES = [
  { type: 'category', label: 'Categories' },
  { type: 'thread', label: 'Threads' },
  { type: 'post', label: 'Posts' },
  { type: 'comment', label: 'Comments' },
  { type: 'reply', label: 'Replies' },
];

export const MAX_PER_GROUP = 8;
const SNIPPET_PAD = 45;

const norm = (s) => (s || '').toLowerCase();

// Every whitespace-separated token has to appear somewhere in the text.
// Substring rather than word-boundary, so "fenc" finds "fence" -- people
// type partial words into a search box and expect that to work.
export function tokenize(query) {
  return norm(query).split(/\s+/).filter(Boolean);
}

export function matches(text, tokens) {
  const hay = norm(text);
  return tokens.every((t) => hay.includes(t));
}

// A window of text around the first matching token, split into plain and
// matched segments so the caller can mark the hits without ever building
// HTML from user input.
export function snippet(text, tokens, pad = SNIPPET_PAD) {
  const body = (text || '').replace(/\s+/g, ' ').trim();
  if (tokens.length === 0) return [{ text: body.slice(0, pad * 2), match: false }];

  const hay = norm(body);
  const first = tokens
    .map((t) => ({ t, at: hay.indexOf(t) }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => a.at - b.at)[0];
  if (!first) return [{ text: body.slice(0, pad * 2), match: false }];

  const start = Math.max(0, first.at - pad);
  const end = Math.min(body.length, first.at + first.t.length + pad);
  const slice = body.slice(start, end);
  const lead = start > 0 ? '…' : '';
  const tail = end < body.length ? '…' : '';

  // Walk the slice marking every token hit, so a multi-word query
  // highlights all of its words rather than only the one we anchored on.
  const lower = norm(slice);
  const hits = [];
  for (const t of tokens) {
    let i = lower.indexOf(t);
    while (i >= 0) {
      hits.push([i, i + t.length]);
      i = lower.indexOf(t, i + t.length);
    }
  }
  hits.sort((a, b) => a[0] - b[0]);

  const parts = [];
  let cursor = 0;
  for (const [from, to] of hits) {
    if (from < cursor) continue; // overlapping tokens: keep the first
    if (from > cursor) parts.push({ text: slice.slice(cursor, from), match: false });
    parts.push({ text: slice.slice(from, to), match: true });
    cursor = to;
  }
  if (cursor < slice.length) parts.push({ text: slice.slice(cursor), match: false });

  if (lead) parts.unshift({ text: lead, match: false });
  if (tail) parts.push({ text: tail, match: false });
  return parts;
}

// Grouped results. Each item carries everything the caller needs to
// navigate straight to it: which thread to open and which element to focus
// once it's open. A category result has no thread -- selecting it just
// switches the sidebar.
export function searchForum(query, { categories = [], threads = [], posts = [], comments = [], replies = [] } = {}) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return { tokens, groups: [], total: 0 };

  const categoryName = (id) => categories.find((c) => c.id === id)?.name || 'Unknown category';
  const threadTitle = (id) => threads.find((t) => t.id === id)?.title || 'Unknown thread';
  const newest = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);

  const found = {
    category: categories
      .filter((c) => matches(c.name, tokens))
      .sort(newest)
      .map((c) => ({
        id: c.id,
        type: 'category',
        categoryId: c.id,
        threadId: null,
        focusId: null,
        title: c.name,
        snippet: snippet(c.name, tokens),
        where: c.archived ? 'Archived category' : 'Category',
        archived: Boolean(c.archived),
      })),

    thread: threads
      .filter((t) => matches(t.title, tokens))
      .sort(newest)
      .map((t) => ({
        id: t.id,
        type: 'thread',
        categoryId: t.categoryId,
        threadId: t.id,
        focusId: null,
        title: t.title,
        snippet: snippet(t.title, tokens),
        where: categoryName(t.categoryId),
        archived: Boolean(t.archived),
        author: t.createdByName,
      })),

    post: posts
      .filter((p) => matches(p.body, tokens))
      .sort(newest)
      .map((p) => ({
        id: p.id,
        type: 'post',
        categoryId: p.categoryId,
        threadId: p.threadId,
        focusId: p.id,
        title: threadTitle(p.threadId),
        snippet: snippet(p.body, tokens),
        where: `${categoryName(p.categoryId)} › ${threadTitle(p.threadId)}`,
        archived: Boolean(p.archived),
        author: p.authorName,
      })),

    // A tombstoned comment's body is the literal "[deleted]", so it can
    // only ever match someone searching for that -- there is no need to
    // filter deleted comments out by hand.
    comment: comments
      .filter((c) => matches(c.body, tokens))
      .sort(newest)
      .map((c) => ({
        id: c.id,
        type: 'comment',
        categoryId: c.categoryId,
        threadId: c.threadId,
        focusId: c.id,
        title: threadTitle(c.threadId),
        snippet: snippet(c.body, tokens),
        where: `${categoryName(c.categoryId)} › ${threadTitle(c.threadId)}`,
        deleted: Boolean(c.deleted),
        author: c.authorName,
      })),

    reply: replies
      .filter((r) => matches(r.body, tokens))
      .sort(newest)
      .map((r) => ({
        id: r.id,
        type: 'reply',
        categoryId: r.categoryId,
        threadId: r.threadId,
        focusId: r.id,
        title: threadTitle(r.threadId),
        snippet: snippet(r.body, tokens),
        where: `${categoryName(r.categoryId)} › ${threadTitle(r.threadId)}`,
        author: r.authorName,
      })),
  };

  const groups = RESULT_TYPES.map(({ type, label }) => ({
    type,
    label,
    total: found[type].length,
    items: found[type].slice(0, MAX_PER_GROUP),
  })).filter((g) => g.total > 0);

  return {
    tokens,
    groups,
    total: RESULT_TYPES.reduce((sum, { type }) => sum + found[type].length, 0),
  };
}

// The flat, in-display-order list -- what Enter and the arrow keys walk.
export function flatten(groups) {
  return groups.flatMap((g) => g.items);
}
