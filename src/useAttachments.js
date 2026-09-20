import { useCallback, useRef, useState } from 'react';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase.js';
import { MAX_PER_ITEM, dimensionsOf, downscale, rejectionReason, storagePath } from './lib/images.js';

let nextId = 0;

// Holds the images being attached to one composer.
//
// Uploads start as soon as a file is picked rather than on submit, so the
// post lands instantly once it's written. The cost is orphans: a file
// uploaded and then abandoned has no document pointing at it, so removing
// one -- or discarding the whole composer -- deletes it from the bucket
// on the way out.
export function useAttachments(uid) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const tasks = useRef(new Map());

  const patch = (id, fields) =>
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...fields } : item)));

  const add = useCallback(
    async (fileList) => {
      const incoming = [...fileList];
      if (incoming.length === 0) return;
      setError('');

      let room = MAX_PER_ITEM - items.length;
      if (room <= 0) {
        setError(`Up to ${MAX_PER_ITEM} images per post.`);
        return;
      }

      for (const original of incoming) {
        if (room <= 0) {
          setError(`Only the first ${MAX_PER_ITEM} images were attached.`);
          break;
        }
        const why = rejectionReason(original);
        if (why) {
          setError(why);
          continue;
        }
        room -= 1;

        const id = `a${nextId++}`;
        const previewUrl = URL.createObjectURL(original);
        setItems((list) => [
          ...list,
          { id, name: original.name, previewUrl, progress: 0, status: 'uploading' },
        ]);

        try {
          // Resize before upload, not after: it saves the person's mobile
          // data, not just our storage.
          const file = await downscale(original);
          const { width, height } = await dimensionsOf(file);
          const path = storagePath(uid, file.name);
          const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });
          tasks.current.set(id, task);

          task.on(
            'state_changed',
            (snap) => patch(id, { progress: snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0 }),
            (err) => {
              console.error('Upload failed', err);
              tasks.current.delete(id);
              patch(id, { status: 'error', message: "That image didn't upload." });
            },
            async () => {
              tasks.current.delete(id);
              const url = await getDownloadURL(task.snapshot.ref);
              patch(id, {
                status: 'done',
                progress: 1,
                url,
                path,
                width,
                height,
                size: file.size,
                contentType: file.type,
              });
            },
          );
        } catch (err) {
          console.error('Could not prepare image', err);
          patch(id, { status: 'error', message: "That image couldn't be read." });
        }
      }
    },
    [items.length, uid],
  );

  // Cancels an in-flight upload or deletes a finished one, so an image the
  // person changed their mind about doesn't sit in the bucket forever.
  const remove = useCallback((id) => {
    setItems((list) => {
      const item = list.find((i) => i.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      const task = tasks.current.get(id);
      if (task) {
        task.cancel();
        tasks.current.delete(id);
      } else if (item?.path) {
        deleteObject(ref(storage, item.path)).catch((err) => {
          // Best effort: a leftover file is untidy, not broken, and
          // failing the interaction over it would be worse.
          console.warn('Could not delete abandoned upload', err);
        });
      }
      return list.filter((i) => i.id !== id);
    });
    setError('');
  }, []);

  // Discarding the composer entirely -- same cleanup, every item.
  const reset = useCallback((deleteUploaded = true) => {
    setItems((list) => {
      for (const item of list) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        const task = tasks.current.get(item.id);
        if (task) {
          task.cancel();
          tasks.current.delete(item.id);
        } else if (deleteUploaded && item.path) {
          deleteObject(ref(storage, item.path)).catch(() => {});
        }
      }
      return [];
    });
    setError('');
  }, []);

  // What actually gets written onto the Firestore document: metadata only,
  // never bytes. A few hundred bytes per image, so the collections the app
  // keeps in memory stay small.
  const toMetadata = useCallback(
    () =>
      items
        .filter((i) => i.status === 'done')
        .map(({ url, path, name, width, height, size, contentType }) => ({
          url,
          path,
          name,
          width: width || 0,
          height: height || 0,
          size: size || 0,
          contentType: contentType || '',
        })),
    [items],
  );

  return {
    items,
    error,
    add,
    remove,
    reset,
    toMetadata,
    uploading: items.some((i) => i.status === 'uploading'),
    full: items.length >= MAX_PER_ITEM,
  };
}
