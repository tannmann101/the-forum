import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { collection, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { db } from './firebase.js';

const COLLECTIONS = ['categories', 'threads', 'posts', 'comments', 'replies', 'activityLog'];

const EMPTY = { categories: [], threads: [], posts: [], comments: [], replies: [], activityLog: [] };

// Breadcrumbs are rendered once, at write time, and stored on the log entry
// -- so the log still reads correctly years later even if a category gets
// renamed. The Activity Log's category filter matches on categoryId instead,
// which a rename can't break.
const CRUMB = ' › ';

export function displayName(user) {
  if (!user) return 'Someone';
  if (user.displayName) return user.displayName;
  return (user.email || 'someone').split('@')[0];
}

// One live listener per collection. Everything is top-level and unfiltered
// on purpose: the whole forum is small enough for a family, every screen
// (thread list counts, the activity chart, the CSV export) wants the full
// picture anyway, and one snapshot per collection keeps a post appearing on
// both of your screens at the same moment with no refresh. If this ever
// grows past a few thousand documents, the thing to scope first is
// posts/comments/replies to the open thread.
export function useForum(user) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | forbidden | error
  const dataRef = useRef(EMPTY);

  useEffect(() => {
    if (!user) return undefined;
    const loaded = new Set();

    const unsubscribes = COLLECTIONS.map((name) =>
      onSnapshot(
        collection(db, name),
        (snap) => {
          const next = { ...dataRef.current, [name]: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
          dataRef.current = next;
          setData(next);
          loaded.add(name);
          if (loaded.size === COLLECTIONS.length) setStatus('ready');
        },
        (err) => {
          console.error(`Failed to sync ${name}`, err);
          setStatus(err.code === 'permission-denied' ? 'forbidden' : 'error');
        },
      ),
    );

    return () => unsubscribes.forEach((fn) => fn());
  }, [user]);

  const actor = useMemo(
    () => ({ actorId: user?.uid || '', actorName: displayName(user) }),
    [user],
  );

  // Every writer below funnels through this: a content write and its
  // activity-log entry go into one batch, so the log can never drift out of
  // sync with what actually got written. Either both land or neither does.
  // `touchThreadId` bumps the thread's lastActivityAt in the same batch,
  // which is what the thread list sorts on.
  const commit = useCallback(
    async ({ collectionName, docData, action, targetType, breadcrumb, categoryId, touchThreadId, updates = [] }) => {
      const batch = writeBatch(db);
      const now = Date.now();

      let targetId = null;
      if (collectionName) {
        const ref = doc(collection(db, collectionName));
        batch.set(ref, docData);
        targetId = ref.id;
      }

      for (const { path, fields } of updates) {
        batch.update(doc(db, ...path), fields);
        if (!targetId) targetId = path[path.length - 1];
      }

      if (touchThreadId) {
        batch.update(doc(db, 'threads', touchThreadId), { lastActivityAt: now });
      }

      batch.set(doc(collection(db, 'activityLog')), {
        ...actor,
        action,
        targetType,
        targetId,
        breadcrumb,
        categoryId: categoryId || null,
        createdAt: now,
      });

      await batch.commit();
      return targetId;
    },
    [actor],
  );


  // Breadcrumb lookups read the live snapshot through the ref rather than
  // through render state, so the writers below stay referentially stable
  // and don't re-create themselves on every incoming snapshot. Nothing
  // renders from these -- they run once, at write time.
  const categoryName = useCallback(
    (id) => dataRef.current.categories.find((c) => c.id === id)?.name || 'Unknown category',
    [],
  );

  const threadTitle = useCallback(
    (id) => dataRef.current.threads.find((t) => t.id === id)?.title || 'Unknown thread',
    [],
  );

  const addCategory = useCallback(
    async (rawName) => {
      const name = rawName.trim();
      if (!name) return null;
      const nextOrder =
        dataRef.current.categories.reduce((max, c) => Math.max(max, Number(c.order) || 0), 0) + 1;
      return commit({
        collectionName: 'categories',
        docData: {
          name,
          createdBy: actor.actorId,
          createdByName: actor.actorName,
          createdAt: Date.now(),
          archived: false,
          archivedAt: null,
          archivedBy: null,
          order: nextOrder,
        },
        action: 'category.create',
        targetType: 'category',
        breadcrumb: name,
      });
    },
    [actor, commit],
  );

  const renameCategory = useCallback(
    async (id, rawName) => {
      const name = rawName.trim();
      const previous = categoryName(id);
      if (!name || name === previous) return;
      await commit({
        action: 'category.rename',
        targetType: 'category',
        // Both names, because "renamed a category" is useless without the
        // before -- and the before is gone from the document itself.
        breadcrumb: `${previous} → ${name}`,
        categoryId: id,
        updates: [{ path: ['categories', id], fields: { name } }],
      });
    },
    [categoryName, commit],
  );

  const setCategoryArchived = useCallback(
    async (id, archived) => {
      await commit({
        action: archived ? 'category.archive' : 'category.unarchive',
        targetType: 'category',
        breadcrumb: categoryName(id),
        categoryId: id,
        updates: [
          {
            path: ['categories', id],
            fields: archived
              ? { archived: true, archivedAt: Date.now(), archivedBy: actor.actorId }
              : { archived: false, archivedAt: null, archivedBy: null },
          },
        ],
      });
    },
    [actor, categoryName, commit],
  );

  // A thread and its opening post are one action, so they share one batch
  // and one log entry ('thread.create'). Logging the opening post
  // separately would double-count starting a conversation in the
  // engagement chart, which is the one number the log exists to get right.
  const addThread = useCallback(
    async ({ categoryId, title: rawTitle, body: rawBody }) => {
      const title = rawTitle.trim();
      const body = rawBody.trim();
      if (!title || !body) return null;

      const batch = writeBatch(db);
      const now = Date.now();
      const threadRef = doc(collection(db, 'threads'));
      const postRef = doc(collection(db, 'posts'));

      batch.set(threadRef, {
        categoryId,
        title,
        createdBy: actor.actorId,
        createdByName: actor.actorName,
        createdAt: now,
        lastActivityAt: now,
      });
      batch.set(postRef, {
        threadId: threadRef.id,
        categoryId,
        authorId: actor.actorId,
        authorName: actor.actorName,
        body,
        isInitial: true,
        createdAt: now,
      });
      batch.set(doc(collection(db, 'activityLog')), {
        ...actor,
        action: 'thread.create',
        targetType: 'thread',
        targetId: threadRef.id,
        breadcrumb: `${categoryName(categoryId)}${CRUMB}${title}`,
        categoryId,
        createdAt: now,
      });

      await batch.commit();
      return threadRef.id;
    },
    [actor, categoryName],
  );

  const addPost = useCallback(
    async ({ threadId, categoryId, body: rawBody }) => {
      const body = rawBody.trim();
      if (!body) return null;
      return commit({
        collectionName: 'posts',
        docData: {
          threadId,
          categoryId,
          authorId: actor.actorId,
          authorName: actor.actorName,
          body,
          isInitial: false,
          createdAt: Date.now(),
        },
        action: 'post.create',
        targetType: 'post',
        breadcrumb: `${categoryName(categoryId)}${CRUMB}${threadTitle(threadId)}`,
        categoryId,
        touchThreadId: threadId,
      });
    },
    [actor, categoryName, commit, threadTitle],
  );

  const addComment = useCallback(
    async ({ postId, threadId, categoryId, body: rawBody, onAuthorName }) => {
      const body = rawBody.trim();
      if (!body) return null;
      return commit({
        collectionName: 'comments',
        docData: {
          postId,
          threadId,
          categoryId,
          authorId: actor.actorId,
          authorName: actor.actorName,
          body,
          createdAt: Date.now(),
        },
        action: 'comment.create',
        targetType: 'comment',
        breadcrumb: `${categoryName(categoryId)}${CRUMB}${threadTitle(threadId)}${CRUMB}on ${onAuthorName}'s post`,
        categoryId,
        touchThreadId: threadId,
      });
    },
    [actor, categoryName, commit, threadTitle],
  );

  const addReply = useCallback(
    async ({ commentId, postId, threadId, categoryId, body: rawBody, onAuthorName }) => {
      const body = rawBody.trim();
      if (!body) return null;
      return commit({
        collectionName: 'replies',
        docData: {
          commentId,
          postId,
          threadId,
          categoryId,
          authorId: actor.actorId,
          authorName: actor.actorName,
          body,
          createdAt: Date.now(),
        },
        action: 'reply.create',
        targetType: 'reply',
        breadcrumb: `${categoryName(categoryId)}${CRUMB}${threadTitle(threadId)}${CRUMB}re: ${onAuthorName}'s comment`,
        categoryId,
        touchThreadId: threadId,
      });
    },
    [actor, categoryName, commit, threadTitle],
  );

  return {
    ...(data || EMPTY),
    status,
    addCategory,
    renameCategory,
    setCategoryArchived,
    addThread,
    addPost,
    addComment,
    addReply,
  };
}
