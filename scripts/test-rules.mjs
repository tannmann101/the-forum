// Scripted checks of firestore.rules against the local Firestore emulator:
// the family allow-list, the per-collection schema, and -- the part this
// app actually leans on -- that posts, comments, replies and the activity
// log are genuinely append-only, so "no editing or deleting" is a property
// of the database and not just of the UI.
//
//   npm run emulators     # in one terminal (needs a Java runtime)
//   npm run test:rules    # in another

import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, writeBatch } from 'firebase/firestore';

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-the-forum',
  firestore: {
    rules: readFileSync('firestore.rules', 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});

await testEnv.clearFirestore();

const TANNER = 'uid-tanner';
const ROCHELLE = 'uid-rochelle';

const tannerCtx = testEnv.authenticatedContext(TANNER, { email: 'tannerwesgardner@gmail.com' });
const rochelleCtx = testEnv.authenticatedContext(ROCHELLE, { email: 'rochelleygardner@gmail.com' });
const strangerCtx = testEnv.authenticatedContext('uid-stranger', { email: 'stranger@example.com' });
const anonCtx = testEnv.unauthenticatedContext();

const tannerDb = tannerCtx.firestore();
const rochelleDb = rochelleCtx.firestore();
const strangerDb = strangerCtx.firestore();
const anonDb = anonCtx.firestore();

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

const now = Date.now();

// Mirrors exactly what useForum.js writes for each collection.
const validCategory = (o = {}) => ({
  name: 'House projects',
  createdBy: TANNER,
  createdByName: 'Tanner',
  createdAt: now,
  archived: false,
  archivedAt: null,
  archivedBy: null,
  order: 1,
  ...o,
});

const validThread = (o = {}) => ({
  categoryId: 'cat1',
  title: 'What do we do about the fence?',
  createdBy: TANNER,
  createdByName: 'Tanner',
  createdAt: now,
  lastActivityAt: now,
  ...o,
});

const validPost = (o = {}) => ({
  threadId: 'thread1',
  categoryId: 'cat1',
  authorId: TANNER,
  authorName: 'Tanner',
  body: 'It leans more every winter.',
  isInitial: true,
  createdAt: now,
  ...o,
});

const validComment = (o = {}) => ({
  postId: 'post1',
  threadId: 'thread1',
  categoryId: 'cat1',
  authorId: ROCHELLE,
  authorName: 'Rochelle',
  body: 'Replace it, do not patch it.',
  createdAt: now,
  ...o,
});

const validReply = (o = {}) => ({
  commentId: 'comment1',
  postId: 'post1',
  threadId: 'thread1',
  categoryId: 'cat1',
  authorId: TANNER,
  authorName: 'Tanner',
  body: 'Agreed.',
  createdAt: now,
  ...o,
});

const validActivity = (o = {}) => ({
  actorId: TANNER,
  actorName: 'Tanner',
  action: 'thread.create',
  targetType: 'thread',
  targetId: 'thread1',
  breadcrumb: 'House projects › What do we do about the fence?',
  categoryId: 'cat1',
  createdAt: now,
  ...o,
});

// ---------- Allow-list ----------
await expect('allowed account can create a category', setDoc(doc(tannerDb, 'categories/cat1'), validCategory()), true);
await expect('allowed account can read it back', getDoc(doc(tannerDb, 'categories/cat1')), true);
await expect(
  'second allowed account (Rochelle) can write too',
  setDoc(doc(rochelleDb, 'categories/cat2'), validCategory({ name: 'Trips', createdBy: ROCHELLE, createdByName: 'Rochelle', order: 2 })),
  true,
);
await expect('allowed account can list the collection', getDocs(collection(tannerDb, 'categories')), true);
await expect('non-allow-listed account is rejected (read)', getDoc(doc(strangerDb, 'categories/cat1')), false);
await expect('non-allow-listed account is rejected (write)', setDoc(doc(strangerDb, 'categories/cat9'), validCategory()), false);
await expect('unauthenticated access is rejected', getDoc(doc(anonDb, 'categories/cat1')), false);

// ---------- Nobody writes under someone else's name ----------
await expect(
  'category claiming another person as creator is rejected',
  setDoc(doc(tannerDb, 'categories/cat10'), validCategory({ createdBy: ROCHELLE })),
  false,
);
await expect(
  'post claiming another person as author is rejected',
  setDoc(doc(tannerDb, 'posts/postX'), validPost({ authorId: ROCHELLE })),
  false,
);
await expect(
  'activity entry claiming another actor is rejected',
  setDoc(doc(tannerDb, 'activityLog/actX'), validActivity({ actorId: ROCHELLE })),
  false,
);

// ---------- Category schema + the one mutable path ----------
await expect('category with a blank name is rejected', setDoc(doc(tannerDb, 'categories/cat11'), validCategory({ name: '' })), false);
await expect('category with a non-bool archived is rejected', setDoc(doc(tannerDb, 'categories/cat12'), validCategory({ archived: 'yes' })), false);
await expect('category missing order is rejected', setDoc(doc(tannerDb, 'categories/cat13'), (({ order: _o, ...rest }) => rest)(validCategory())), false);
await expect('category can be renamed', updateDoc(doc(tannerDb, 'categories/cat1'), { name: 'House & yard' }), true);
await expect(
  'category can be archived by either account',
  updateDoc(doc(rochelleDb, 'categories/cat1'), { archived: true, archivedAt: Date.now(), archivedBy: ROCHELLE }),
  true,
);
await expect('category can be unarchived', updateDoc(doc(tannerDb, 'categories/cat1'), { archived: false, archivedAt: null, archivedBy: null }), true);
await expect('category authorship cannot be rewritten', updateDoc(doc(tannerDb, 'categories/cat1'), { createdByName: 'Somebody else' }), false);
await expect('category cannot be deleted', deleteDoc(doc(tannerDb, 'categories/cat2')), false);

// ---------- Threads ----------
await expect('thread can be created', setDoc(doc(tannerDb, 'threads/thread1'), validThread()), true);
await expect('thread with a blank title is rejected', setDoc(doc(tannerDb, 'threads/thread9'), validThread({ title: '' })), false);
await expect('thread lastActivityAt can be bumped', updateDoc(doc(rochelleDb, 'threads/thread1'), { lastActivityAt: Date.now() }), true);
await expect('thread title cannot be edited', updateDoc(doc(tannerDb, 'threads/thread1'), { title: 'Something else' }), false);
await expect('thread cannot be deleted', deleteDoc(doc(tannerDb, 'threads/thread1')), false);

// ---------- Posts / comments / replies are append-only ----------
await expect('post can be created', setDoc(doc(tannerDb, 'posts/post1'), validPost()), true);
await expect('post with an empty body is rejected', setDoc(doc(tannerDb, 'posts/post9'), validPost({ body: '' })), false);
await expect('post with a non-bool isInitial is rejected', setDoc(doc(tannerDb, 'posts/post8'), validPost({ isInitial: 'yes' })), false);
await expect('post with an over-long body is rejected', setDoc(doc(tannerDb, 'posts/post7'), validPost({ body: 'x'.repeat(20001) })), false);
await expect('post cannot be edited', updateDoc(doc(tannerDb, 'posts/post1'), { body: 'Actually, never mind.' }), false);
await expect('post cannot be deleted', deleteDoc(doc(tannerDb, 'posts/post1')), false);

await expect('comment can be created', setDoc(doc(rochelleDb, 'comments/comment1'), validComment()), true);
await expect('comment missing its postId is rejected', setDoc(doc(rochelleDb, 'comments/comment9'), (({ postId: _p, ...rest }) => rest)(validComment())), false);
await expect('comment cannot be edited', updateDoc(doc(rochelleDb, 'comments/comment1'), { body: 'rewritten' }), false);
await expect('comment cannot be deleted', deleteDoc(doc(rochelleDb, 'comments/comment1')), false);

await expect('reply can be created', setDoc(doc(tannerDb, 'replies/reply1'), validReply()), true);
await expect('reply missing its commentId is rejected', setDoc(doc(tannerDb, 'replies/reply9'), (({ commentId: _c, ...rest }) => rest)(validReply())), false);
await expect('reply cannot be edited', updateDoc(doc(tannerDb, 'replies/reply1'), { body: 'rewritten' }), false);
await expect('reply cannot be deleted', deleteDoc(doc(tannerDb, 'replies/reply1')), false);

// ---------- Activity log ----------
await expect('activity entry can be created', setDoc(doc(tannerDb, 'activityLog/act1'), validActivity()), true);
await expect('activity entry with an unknown action is rejected', setDoc(doc(tannerDb, 'activityLog/act9'), validActivity({ action: 'post.delete' })), false);
await expect('activity entry with an unknown targetType is rejected', setDoc(doc(tannerDb, 'activityLog/act8'), validActivity({ targetType: 'reaction' })), false);
await expect('activity entry without a categoryId is allowed', setDoc(doc(tannerDb, 'activityLog/act7'), validActivity({ action: 'category.create', targetType: 'category', categoryId: null })), true);
await expect('activity entry cannot be edited', updateDoc(doc(tannerDb, 'activityLog/act1'), { breadcrumb: 'somewhere else' }), false);
await expect('activity entry cannot be deleted', deleteDoc(doc(tannerDb, 'activityLog/act1')), false);

// ---------- The batch the app actually writes ----------
// A post, its activity-log entry, and the thread's lastActivityAt bump all
// commit together -- this is the exact shape useForum.js sends, so if the
// rules reject any one part the whole feature is broken.
const goodBatch = writeBatch(tannerDb);
goodBatch.set(doc(collection(tannerDb, 'posts')), validPost({ isInitial: false, body: 'Follow-up post.' }));
goodBatch.update(doc(tannerDb, 'threads/thread1'), { lastActivityAt: Date.now() });
goodBatch.set(doc(collection(tannerDb, 'activityLog')), validActivity({ action: 'post.create', targetType: 'post', targetId: 'whatever' }));
await expect('a post + log + thread-bump batch commits as one unit', goodBatch.commit(), true);

// And a batch whose log entry is malformed takes the content write down
// with it, which is the whole point of batching them together.
const badBatch = writeBatch(tannerDb);
badBatch.set(doc(collection(tannerDb, 'posts')), validPost({ isInitial: false, body: 'Should never land.' }));
badBatch.set(doc(collection(tannerDb, 'activityLog')), validActivity({ action: 'nonsense.action' }));
await expect('a batch with a bad log entry is rejected whole', badBatch.commit(), false);

await testEnv.cleanup();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll checks passed.');
}
