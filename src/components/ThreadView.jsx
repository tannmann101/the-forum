import { useEffect, useMemo, useState } from 'react';
import { ArchivedNote, Body, Byline, Card, Composer, EmptyState, ItemActions, LinkPreviews, Tombstone } from '../ui.jsx';

const byTime = (a, b) => a.createdAt - b.createdAt;

// One level of replies under a comment, and that's the floor -- there's no
// reply-to-reply, so a family disagreement can't turn into a thread that
// indents off the right edge of the screen.
function Reply({ reply, roster, me, editing, onStartEdit, onStopEdit, onEdit, onDelete }) {
  const mine = reply.authorId === me;

  return (
    <li className="reply" id={`item-${reply.id}`}>
      <Byline
        name={reply.authorName}
        personId={reply.authorId}
        roster={roster}
        at={reply.createdAt}
        editedAt={reply.editedAt}
        size="sm"
      />
      {editing ? (
        <Composer
          alwaysOpen
          rows={2}
          initialBody={reply.body}
          submitLabel="Save"
          placeholder="Edit your reply…"
          onSubmit={(body) => onEdit(reply, body).then(onStopEdit)}
          onCancel={onStopEdit}
        />
      ) : (
        <>
          <Body>{reply.body}</Body>
          <LinkPreviews text={reply.body} size="sm" />
          {mine ? (
            <ItemActions
              actions={[
                { label: 'Edit', onClick: () => onStartEdit(reply.id) },
                // Replies never nest further, so nothing is underneath to
                // strand -- this really deletes.
                {
                  label: 'Delete',
                  danger: true,
                  onClick: () => {
                    if (window.confirm('Delete this reply? It will be gone for good.')) onDelete(reply);
                  },
                },
              ]}
            />
          ) : null}
        </>
      )}
    </li>
  );
}

function Comment({ comment, replies, roster, me, editingId, onStartEdit, onStopEdit, handlers }) {
  const mine = replies.filter((r) => r.commentId === comment.id).sort(byTime);
  const isMine = comment.authorId === me;
  const editing = editingId === comment.id;
  const deleted = Boolean(comment.deleted);

  return (
    <li className="comment" id={`item-${comment.id}`}>
      <Byline
        name={comment.authorName}
        personId={comment.authorId}
        roster={roster}
        at={comment.createdAt}
        editedAt={deleted ? null : comment.editedAt}
        size="sm"
      />

      {deleted ? (
        <Tombstone>Comment deleted. Its replies are kept below.</Tombstone>
      ) : editing ? (
        <Composer
          alwaysOpen
          rows={2}
          initialBody={comment.body}
          submitLabel="Save"
          placeholder="Edit your comment…"
          onSubmit={(body) => handlers.onEditComment(comment, body).then(onStopEdit)}
          onCancel={onStopEdit}
        />
      ) : (
        <>
          <Body>{comment.body}</Body>
          <LinkPreviews text={comment.body} size="sm" />
          {isMine ? (
            <ItemActions
              actions={[
                { label: 'Edit', onClick: () => onStartEdit(comment.id) },
                {
                  label: 'Delete',
                  danger: true,
                  onClick: () => {
                    // Say which of the two deletes this is before doing it --
                    // "gone for good" and "kept as a tombstone" are different
                    // enough that the confirm shouldn't paper over it.
                    const message = mine.length
                      ? `This comment has ${mine.length} ${mine.length === 1 ? 'reply' : 'replies'} under it, so the text will be replaced with "[deleted]" and the replies kept. Continue?`
                      : 'Delete this comment? It will be gone for good.';
                    if (window.confirm(message)) handlers.onDeleteComment(comment);
                  },
                },
              ]}
            />
          ) : null}
        </>
      )}

      {mine.length > 0 ? (
        <ul className="reply-list">
          {mine.map((r) => (
            <Reply
              key={r.id}
              reply={r}
              roster={roster}
              me={me}
              editing={editingId === r.id}
              onStartEdit={onStartEdit}
              onStopEdit={onStopEdit}
              onEdit={handlers.onEditReply}
              onDelete={handlers.onDeleteReply}
            />
          ))}
        </ul>
      ) : null}

      <div className="reply-composer">
        <Composer
          prompt="Reply"
          submitLabel="Reply"
          placeholder={`Reply to ${comment.authorName}…`}
          rows={2}
          onSubmit={(body) => handlers.onAddReply(comment, body)}
        />
      </div>
    </li>
  );
}

function Post({ post, comments, replies, roster, me, editingId, onStartEdit, onStopEdit, handlers }) {
  const mine = comments.filter((c) => c.postId === post.id).sort(byTime);
  const isMine = post.authorId === me;
  const editing = editingId === post.id;
  const archived = Boolean(post.archived);

  return (
    <Card
      id={`item-${post.id}`}
      className={`post ${post.isInitial ? 'is-initial' : ''} ${archived ? 'is-archived' : ''}`}
    >
      <Byline
        name={post.authorName}
        personId={post.authorId}
        roster={roster}
        at={post.createdAt}
        editedAt={archived ? null : post.editedAt}
        trailing={post.isInitial ? <span className="initial-tag">Opening post</span> : null}
      />

      {archived ? (
        <ArchivedNote
          what="Post"
          by={post.archivedBy === me ? 'you' : post.authorName}
          at={post.archivedAt}
          onUnarchive={isMine ? () => handlers.onSetPostArchived(post, false) : null}
        />
      ) : editing ? (
        <Composer
          alwaysOpen
          rows={4}
          initialBody={post.body}
          submitLabel="Save"
          placeholder="Edit your post…"
          onSubmit={(body) => handlers.onEditPost(post, body).then(onStopEdit)}
          onCancel={onStopEdit}
        />
      ) : (
        <>
          <Body>{post.body}</Body>
          <LinkPreviews text={post.body} size="md" />
          {isMine ? (
            <ItemActions
              actions={[
                { label: 'Edit', onClick: () => onStartEdit(post.id) },
                // Archive, never delete: comments hang off a post, and
                // deleting one would take someone else's comments with it.
                { label: 'Archive', onClick: () => handlers.onSetPostArchived(post, true) },
              ]}
            />
          ) : null}
        </>
      )}

      {/* Comments stay visible under an archived post -- they're other
          people's words, and archiving your own post shouldn't hide them. */}
      {mine.length > 0 ? (
        <ul className="comment-list">
          {mine.map((comment) => (
            <Comment
              key={comment.id}
              comment={comment}
              replies={replies}
              roster={roster}
              me={me}
              editingId={editingId}
              onStartEdit={onStartEdit}
              onStopEdit={onStopEdit}
              handlers={handlers}
            />
          ))}
        </ul>
      ) : null}

      {archived ? null : (
        <div className="comment-composer">
          <Composer
            prompt="Add a comment"
            submitLabel="Comment"
            placeholder={`Comment on ${post.authorName}'s post…`}
            rows={2}
            onSubmit={(body) => handlers.onAddComment(post, body)}
          />
        </div>
      )}
    </Card>
  );
}

// Opening post at the top, then follow-up posts in the order they were
// written. Follow-up posts are untitled by design -- the thread has the
// title, and the posts under it are just the conversation continuing.
export default function ThreadView({ thread, category, posts, comments, replies, roster, me, focusId, onBack, handlers }) {
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);

  // Arriving from a search result: scroll the matched post/comment/reply
  // into view and flash it, so you land on the thing you searched for
  // rather than at the top of a long thread hunting for it. Waits a frame
  // because the element only exists once this render has painted.
  useEffect(() => {
    if (!focusId) return undefined;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`item-${focusId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('is-found');
      // Remove the class rather than leaving it -- it's a "here it is"
      // flash, not a persistent selection.
      window.setTimeout(() => el.classList.remove('is-found'), 2600);
    });
    return () => cancelAnimationFrame(raf);
  }, [focusId, thread.id]);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(thread.title);

  const ordered = useMemo(() => {
    const mine = posts.filter((p) => p.threadId === thread.id).sort(byTime);
    // isInitial is authoritative, not "whichever is oldest" -- a clock skew
    // between two devices shouldn't be able to demote the opening post.
    return [...mine.filter((p) => p.isInitial), ...mine.filter((p) => !p.isInitial)];
  }, [posts, thread.id]);

  const threadComments = useMemo(() => comments.filter((c) => c.threadId === thread.id), [comments, thread.id]);
  const threadReplies = useMemo(() => replies.filter((r) => r.threadId === thread.id), [replies, thread.id]);

  const guard = (fn) => async (...args) => {
    setError('');
    try {
      return await fn(...args);
    } catch (err) {
      console.error('Write failed', err);
      setError("That didn't save. Check your connection and try again.");
      throw err;
    }
  };

  const guarded = useMemo(
    () => Object.fromEntries(Object.entries(handlers).map(([key, fn]) => [key, guard(fn)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handlers],
  );

  const isMine = thread.createdBy === me;
  const archived = Boolean(thread.archived);

  return (
    <div className="page thread-view">
      <button type="button" className="back-link" onClick={onBack}>
        ← {category?.name || 'Back'}
      </button>

      <div className="page-head">
        {editingTitle ? (
          <form
            className="title-edit"
            onSubmit={(e) => {
              e.preventDefault();
              guarded.onEditThread(thread, titleDraft).then(() => setEditingTitle(false));
            }}
          >
            <input
              className="input thread-title-input"
              value={titleDraft}
              maxLength={140}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setTitleDraft(thread.title);
                  setEditingTitle(false);
                }
              }}
              autoFocus
              aria-label="Thread title"
            />
            <div className="title-edit-actions">
              <button type="submit" className="btn-primary btn-small" disabled={!titleDraft.trim()}>
                Save
              </button>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setTitleDraft(thread.title);
                  setEditingTitle(false);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <h1>
            {thread.title}
            {archived ? <span className="archived-tag">Archived</span> : null}
          </h1>
        )}

        <p>
          Started by {thread.createdByName} ·{' '}
          {new Date(thread.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          {thread.editedAt ? ' · retitled since' : ''}
        </p>

        {isMine && !editingTitle ? (
          <ItemActions
            actions={[
              { label: 'Edit title', onClick: () => { setTitleDraft(thread.title); setEditingTitle(true); } },
              archived
                ? { label: 'Unarchive thread', onClick: () => guarded.onSetThreadArchived(thread, false) }
                : { label: 'Archive thread', onClick: () => guarded.onSetThreadArchived(thread, true) },
            ]}
          />
        ) : null}
      </div>

      {error ? <p className="composer-error page-error">{error}</p> : null}

      {ordered.length === 0 ? (
        <EmptyState>This thread has no posts yet.</EmptyState>
      ) : (
        <div className="post-stack">
          {ordered.map((post) => (
            <Post
              key={post.id}
              post={post}
              comments={threadComments}
              replies={threadReplies}
              roster={roster}
              me={me}
              editingId={editingId}
              onStartEdit={setEditingId}
              onStopEdit={() => setEditingId(null)}
              handlers={guarded}
            />
          ))}
        </div>
      )}

      {/* An archived thread is read-only: it's been put away, so nothing
          new gets added to it until whoever owns it brings it back. */}
      {archived ? null : (
        <Card className="new-post-card">
          <Composer
            prompt="Add another post to this thread…"
            submitLabel="Post"
            placeholder="Keep the thread going…"
            rows={4}
            onSubmit={guarded.onAddPost}
          />
        </Card>
      )}
    </div>
  );
}
