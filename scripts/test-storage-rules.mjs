// Scripted checks of storage.rules against the Storage emulator: the same
// family allow-list as Firestore, images only, a size ceiling, and uploads
// confined to the uploader's own folder.
//
//   npm run emulators
//   npm run test:storage

import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-the-forum',
  storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
});

await testEnv.clearStorage();

const TANNER = 'uid-tanner';
const ROCHELLE = 'uid-rochelle';
const tanner = testEnv.authenticatedContext(TANNER, { email: 'tannerwesgardner@gmail.com' }).storage();
const rochelle = testEnv.authenticatedContext(ROCHELLE, { email: 'rochelleygardner@gmail.com' }).storage();
const stranger = testEnv.authenticatedContext('uid-x', { email: 'stranger@example.com' }).storage();
const anon = testEnv.unauthenticatedContext().storage();

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${label}`);
  if (!ok) failures++;
};
const expect = async (label, promise, shouldSucceed) => {
  try {
    await (shouldSucceed ? assertSucceeds(promise) : assertFails(promise));
    check(label, true);
  } catch (e) {
    check(label, false);
    console.error(`  ${e.message}`);
  }
};

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const image = { contentType: 'image/png' };

// ---------- Allow-list ----------
await expect('allowed account can upload to its own folder',
  uploadBytes(ref(tanner, `attachments/${TANNER}/a.png`), png, image), true);
await expect('the other allowed account can upload to its own folder',
  uploadBytes(ref(rochelle, `attachments/${ROCHELLE}/b.png`), png, image), true);
await expect('allowed accounts can read each other\'s attachments',
  getBytes(ref(rochelle, `attachments/${TANNER}/a.png`)), true);
await expect('non-allow-listed account cannot read',
  getBytes(ref(stranger, `attachments/${TANNER}/a.png`)), false);
await expect('non-allow-listed account cannot upload',
  uploadBytes(ref(stranger, 'attachments/uid-x/c.png'), png, image), false);
await expect('unauthenticated cannot read',
  getBytes(ref(anon, `attachments/${TANNER}/a.png`)), false);
await expect('unauthenticated cannot upload',
  uploadBytes(ref(anon, 'attachments/anon/d.png'), png, image), false);

// ---------- Ownership is the path ----------
await expect('cannot upload into someone else\'s folder',
  uploadBytes(ref(rochelle, `attachments/${TANNER}/sneaky.png`), png, image), false);
await expect('cannot upload outside the attachments tree',
  uploadBytes(ref(tanner, `elsewhere/${TANNER}/e.png`), png, image), false);
await expect('cannot upload to the bucket root',
  uploadBytes(ref(tanner, 'root.png'), png, image), false);

// ---------- Images only ----------
// Without the contentType check the bucket is a general file host, and an
// uploaded .html would be served from the app's own storage domain.
for (const [type, allowed] of [
  ['image/jpeg', true], ['image/png', true], ['image/gif', true], ['image/webp', true],
  ['image/avif', true], ['image/heic', true], ['image/heif', true],
  ['text/html', false], ['application/pdf', false], ['image/svg+xml', false],
  ['application/javascript', false], ['text/plain', false],
]) {
  await expect(`${allowed ? 'accepts' : 'rejects'} ${type}`,
    uploadBytes(ref(tanner, `attachments/${TANNER}/t-${type.replace(/\W/g, '')}`), png, { contentType: type }),
    allowed);
}

// ---------- Size ceiling ----------
await expect('rejects a file over 10 MB',
  uploadBytes(ref(tanner, `attachments/${TANNER}/big.png`), new Uint8Array(10 * 1024 * 1024 + 16), image), false);
await expect('accepts a file just under 10 MB',
  uploadBytes(ref(tanner, `attachments/${TANNER}/ok.png`), new Uint8Array(9 * 1024 * 1024), image), true);

// ---------- Deletes (used to clean up abandoned uploads) ----------
await expect('cannot delete someone else\'s upload',
  deleteObject(ref(rochelle, `attachments/${TANNER}/a.png`)), false);
await expect('can delete your own upload',
  deleteObject(ref(tanner, `attachments/${TANNER}/a.png`)), true);

await testEnv.cleanup();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll checks passed.');
}
