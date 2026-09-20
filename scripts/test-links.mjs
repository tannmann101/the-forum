// Unit tests for URL detection and link previews. Pure functions, no DOM
// and no network -- same split as test-search.mjs and test-activity.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeLink, domainOf, isImageUrl, parseBody, previewsFor, safeUrl, youtubeId } from '../src/lib/links.js';

const links = (text) => parseBody(text).filter((p) => p.type === 'link');

test('a body with no links is one text part', () => {
  const parts = parseBody('Just some words about the fence.');
  assert.equal(parts.length, 1);
  assert.equal(parts[0].type, 'text');
});

test('http and https links are found', () => {
  assert.equal(links('see https://example.com/a')[0].url, 'https://example.com/a');
  assert.equal(links('see http://example.com/a')[0].url, 'http://example.com/a');
});

test('bare www links get https', () => {
  assert.equal(links('try www.example.com today')[0].url, 'https://www.example.com/');
});

test('surrounding text is preserved in order', () => {
  const parts = parseBody('Look at https://example.com then tell me.');
  assert.deepEqual(parts.map((p) => p.type), ['text', 'link', 'text']);
  assert.equal(parts[0].text, 'Look at ');
  assert.equal(parts[2].text, ' then tell me.');
});

test('trailing sentence punctuation is not part of the link', () => {
  for (const [body, expected] of [
    ['see https://example.com.', 'https://example.com/'],
    ['see https://example.com, then', 'https://example.com/'],
    ['really? https://example.com!', 'https://example.com/'],
  ]) {
    assert.equal(links(body)[0].url, expected, body);
  }
});

test('balanced brackets inside a URL are kept', () => {
  const url = links('https://en.wikipedia.org/wiki/Fence_(disambiguation)')[0].url;
  assert.ok(url.endsWith('(disambiguation)'), url);
});

test('a closing bracket belonging to the sentence is dropped', () => {
  const url = links('(see https://example.com/a)')[0].url;
  assert.equal(url, 'https://example.com/a');
});

test('multiple links in one body are all found', () => {
  const found = links('one https://a.example.com two https://b.example.com three');
  assert.deepEqual(found.map((l) => domainOf(l.url)), ['a.example.com', 'b.example.com']);
});

// The security-relevant case: a body is plain text, so these are just
// words -- but they must never become a live href.
test('dangerous schemes are never linked', () => {
  for (const nasty of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ]) {
    assert.equal(safeUrl(nasty), null, nasty);
    assert.equal(links(`click ${nasty} now`).length, 0, nasty);
  }
});

test('safeUrl rejects nonsense rather than throwing', () => {
  for (const bad of ['', null, undefined, 'not a url', 'http://']) {
    assert.doesNotThrow(() => safeUrl(bad));
    assert.equal(safeUrl(bad), null);
  }
});

test('image URLs are recognised by extension', () => {
  for (const ext of ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg']) {
    assert.ok(isImageUrl(`https://example.com/photo.${ext}`), ext);
  }
  assert.ok(!isImageUrl('https://example.com/page.html'));
  assert.ok(!isImageUrl('https://example.com/'));
});

test('a query string does not defeat image detection', () => {
  assert.ok(isImageUrl('https://example.com/photo.png?width=800'));
});

test('youtube ids are pulled from every common URL shape', () => {
  const id = 'dQw4w9WgXcQ';
  for (const url of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=30s`,
    `https://youtu.be/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://m.youtube.com/watch?v=${id}`,
  ]) {
    assert.equal(youtubeId(url), id, url);
  }
});

test('non-youtube URLs yield no video id', () => {
  assert.equal(youtubeId('https://example.com/watch?v=abc'), null);
  assert.equal(youtubeId('https://vimeo.com/12345'), null);
  assert.equal(youtubeId('not a url'), null);
});

test('describeLink classifies the three cases', () => {
  const video = describeLink('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(video.kind, 'video');
  assert.ok(video.thumbnail.includes('dQw4w9WgXcQ'));

  const image = describeLink('https://example.com/fence.jpg');
  assert.equal(image.kind, 'image');
  assert.equal(image.thumbnail, 'https://example.com/fence.jpg');

  // No backend to read Open Graph tags, so a generic page gets a domain
  // and no thumbnail rather than a guess.
  const page = describeLink('https://example.com/article');
  assert.equal(page.kind, 'link');
  assert.equal(page.thumbnail, null);
  assert.equal(page.domain, 'example.com');
});

test('previews are de-duplicated and capped', () => {
  const same = 'https://example.com/a.png shared twice https://example.com/a.png';
  assert.equal(previewsFor(same).length, 1);

  const many = Array.from({ length: 9 }, (_, i) => `https://example.com/p${i}.png`).join(' ');
  assert.equal(previewsFor(many).length, 4);
  assert.equal(previewsFor(many, { max: 2 }).length, 2);
});

test('previewsFor on a plain body is empty', () => {
  assert.deepEqual(previewsFor('no links at all'), []);
  assert.deepEqual(previewsFor(''), []);
  assert.deepEqual(previewsFor(undefined), []);
});

test('newlines around links survive parsing', () => {
  const parts = parseBody('Line one\nhttps://example.com\nLine three');
  assert.equal(parts.filter((p) => p.type === 'link').length, 1);
  assert.equal(parts.map((p) => p.text).join(''), 'Line one\nhttps://example.com\nLine three');
});

test('the parsed parts always rebuild the original text', () => {
  for (const body of [
    'plain',
    'a https://example.com b',
    '(https://example.com/a) and https://b.example.com.',
    'www.example.com at the start',
    '',
  ]) {
    assert.equal(parseBody(body).map((p) => p.text).join(''), body, JSON.stringify(body));
  }
});
