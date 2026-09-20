// links.js
// Finds URLs in the plain-text bodies people type, and works out what can
// be shown for each one. Pure functions, no DOM and no network, so
// scripts/test-links.mjs can exercise them under `node --test`.
//
// Bodies stay plain text in Firestore -- nothing here is stored, and no
// markup is ever produced. These functions return data that the components
// turn into React elements, so a body can never inject HTML however it is
// written.

// Bare `www.` is included because people type it; everything else needs a
// scheme. Deliberately stops at whitespace and at the quote/angle
// characters that usually mean the URL has ended.
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

// Trailing punctuation almost always belongs to the sentence, not the link:
// "see https://example.com." should not link the full stop.
const TRAILING = /[.,;:!?'"]+$/;

const IMAGE_EXT = /\.(?:jpe?g|png|gif|webp|avif|bmp|svg)$/i;

// A URL wrapped in brackets by the writer -- "(https://example.com)" --
// keeps its own balanced pairs but drops the closing one that belongs to
// the sentence. Wikipedia links depend on this.
function trimTrailing(raw) {
  let url = raw.replace(TRAILING, '');
  for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
    while (url.endsWith(close)) {
      const opens = url.split(open).length - 1;
      const closes = url.split(close).length - 1;
      if (closes <= opens) break;
      url = url.slice(0, -1).replace(TRAILING, '');
    }
  }
  return url;
}

// Only http and https ever become a link. A body is plain text, so a
// "javascript:" or "data:" string in one is just words -- but the moment
// it becomes an href it would be live, so the scheme is checked here
// rather than trusted from the match.
export function safeUrl(raw) {
  if (!raw) return null;
  const candidate = /^www\./i.test(raw) ? `https://${raw}` : raw;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.href;
}

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// YouTube is the one video host whose thumbnail can be derived from the id
// alone, with no API call and no third-party service in the middle. Other
// hosts need an oEmbed round-trip, so they fall back to a plain link.
export function youtubeId(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') return null;
  if (u.pathname === '/watch') return u.searchParams.get('v');
  const m = u.pathname.match(/^\/(?:embed|shorts|v|live)\/([^/?#]+)/);
  return m ? m[1] : null;
}

export function isImageUrl(url) {
  try {
    return IMAGE_EXT.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

// What can actually be shown for a link. 'image' and 'video' carry a
// thumbnail that needs no server; 'link' is everything else, which without
// a backend to read Open Graph tags is a domain and nothing more.
export function describeLink(url) {
  const id = youtubeId(url);
  if (id) {
    return {
      url,
      kind: 'video',
      domain: domainOf(url),
      // hqdefault exists for every video; maxres does not, and a missing
      // one returns a grey placeholder rather than a 404, so it can't be
      // detected with onError.
      thumbnail: `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`,
      label: 'YouTube video',
    };
  }
  if (isImageUrl(url)) {
    return { url, kind: 'image', domain: domainOf(url), thumbnail: url, label: 'Image' };
  }
  return { url, kind: 'link', domain: domainOf(url), thumbnail: null, label: domainOf(url) };
}

// Splits a body into plain and link segments, in order, so a component can
// render anchors without ever touching innerHTML.
export function parseBody(text) {
  const body = text || '';
  const parts = [];
  let cursor = 0;

  for (const match of body.matchAll(URL_PATTERN)) {
    const raw = trimTrailing(match[0]);
    const url = safeUrl(raw);
    const start = match.index;
    if (!url) continue;
    if (start > cursor) parts.push({ type: 'text', text: body.slice(cursor, start) });
    parts.push({ type: 'link', text: raw, url });
    cursor = start + raw.length;
  }

  if (cursor < body.length) parts.push({ type: 'text', text: body.slice(cursor) });
  return parts.length ? parts : [{ type: 'text', text: body }];
}

// The distinct links in a body, described, for the preview strip under it.
// De-duplicated so pasting the same link twice doesn't show it twice.
export function previewsFor(text, { max = 4 } = {}) {
  const seen = new Set();
  const out = [];
  for (const part of parseBody(text)) {
    if (part.type !== 'link' || seen.has(part.url)) continue;
    seen.add(part.url);
    out.push(describeLink(part.url));
    if (out.length >= max) break;
  }
  return out;
}
