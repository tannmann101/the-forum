// Unit tests for the pure parts of attachment handling. The canvas work in
// downscale() needs a browser and is covered by the Playwright pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_TYPES, MAX_BYTES, formatBytes, rejectionReason, safeFileName, scaledSize, storagePath,
} from '../src/lib/images.js';
import { readFileSync } from 'node:fs';

const file = (o = {}) => ({ name: 'photo.jpg', type: 'image/jpeg', size: 1024, ...o });

test('ordinary images are accepted', () => {
  for (const type of ALLOWED_TYPES) {
    assert.equal(rejectionReason(file({ type })), null, type);
  }
});

test('non-images are rejected with a readable reason', () => {
  const why = rejectionReason(file({ type: 'application/pdf', name: 'quote.pdf' }));
  assert.match(why, /Only images/);
});

test('an unsupported image format names itself', () => {
  assert.match(rejectionReason(file({ type: 'image/tiff' })), /TIFF/);
});

test('oversized files are rejected, and the message states both numbers', () => {
  const why = rejectionReason(file({ size: MAX_BYTES + 1 }));
  assert.match(why, /11\.0 MB|10\.0 MB/);
  assert.equal(rejectionReason(file({ size: MAX_BYTES - 1 })), null, 'just under is fine');
});

test('rejectionReason never throws on junk', () => {
  for (const bad of [null, undefined, {}]) {
    assert.doesNotThrow(() => rejectionReason(bad));
  }
});

test('the allow-list matches storage.rules exactly', () => {
  // These drift silently otherwise: the form accepts a file the bucket
  // then refuses, and the upload fails after the person picked it.
  const rules = readFileSync('storage.rules', 'utf8');
  const pattern = rules.match(/image\/\(([a-z|]+)\)/)[1].split('|').sort();
  const client = ALLOWED_TYPES.map((t) => t.replace('image/', '')).sort();
  assert.deepEqual(client, pattern);
});

test('the size cap matches storage.rules', () => {
  const rules = readFileSync('storage.rules', 'utf8');
  const mb = Number(rules.match(/size < (\d+) \* 1024 \* 1024/)[1]);
  assert.equal(MAX_BYTES, mb * 1024 * 1024);
});

test('scaling fits inside the cap without enlarging', () => {
  assert.deepEqual(scaledSize(4000, 3000, 2000), { width: 2000, height: 1500, scaled: true });
  assert.deepEqual(scaledSize(3000, 4000, 2000), { width: 1500, height: 2000, scaled: true });
  assert.deepEqual(scaledSize(800, 600, 2000), { width: 800, height: 600, scaled: false });
  assert.deepEqual(scaledSize(2000, 2000, 2000), { width: 2000, height: 2000, scaled: false });
});

test('scaling handles missing dimensions', () => {
  assert.equal(scaledSize(0, 0).scaled, false);
  assert.equal(scaledSize(undefined, undefined).scaled, false);
});

test('file names are stripped of paths and oddities', () => {
  assert.equal(safeFileName('/etc/passwd'), 'passwd');
  assert.equal(safeFileName('C:\\Users\\me\\photo.jpg'), 'photo.jpg');
  assert.equal(safeFileName('../../secret.png'), 'secret.png');
  assert.equal(safeFileName('my photo (1).jpg'), 'my-photo-1.jpg');
  assert.equal(safeFileName(''), 'image');
  assert.equal(safeFileName(undefined), 'image');
});

test('a long file name is truncated', () => {
  assert.ok(safeFileName(`${'a'.repeat(300)}.jpg`).length <= 60);
});

test('storage paths are scoped to the uploader and made unique', () => {
  const path = storagePath('uid-tanner', 'photo.jpg', () => 'abc123');
  assert.equal(path, 'attachments/uid-tanner/abc123-photo.jpg');
  // The uid segment is what storage.rules checks, so a crafted name must
  // not be able to climb out of it.
  assert.ok(storagePath('uid-tanner', '../../other/evil.png').startsWith('attachments/uid-tanner/'));
  assert.ok(!storagePath('uid-tanner', '../../other/evil.png').includes('..'));
});

test('two uploads of the same name do not collide', () => {
  assert.notEqual(storagePath('u', 'a.jpg'), storagePath('u', 'a.jpg'));
});

test('byte formatting is readable', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
});
