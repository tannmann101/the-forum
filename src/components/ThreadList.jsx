import { useMemo, useState } from 'react';
import { Byline, Card, Count, EmptyState } from '../ui.jsx';
import { MAX_TITLE } from '../theme.js';

// Starting a thread needs a title AND an opening post, so it gets its own
// two-field form rather than the shared Composer.
function NewThreadForm({ onCreate, disabled }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) {
    return (
      <button type="button" className="composer-prompt" disabled={disabled} onClick={() => setOpen(true)}>
        Start a new thread…
      </button>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await onCreate({ title, body });
      setTitle('');
      setBody('');
      setOpen(false);
    } catch (err) {
      console.error('Failed to start thread', err);
      setError("That didn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="new-thread-card">
      <form className="composer" onSubmit={submit}>
        <input
          className="input thread-title-input"
          placeholder="What's this thread about?"
          value={title}
          maxLength={MAX_TITLE}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <textarea
          className="input composer-body"
          rows={4}
          placeholder="Say the first thing…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(e);
          }}
        />
        {error ? <p className="composer-error">{error}</p> : null}
        <div className="composer-actions">
          <button type="submit" className="btn-primary" disabled={busy || !title.trim() || !body.trim()}>
            {busy ? 'Starting…' : 'Start thread'}
          </button>
          <button type="button" className="link-btn" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <span className="composer-hint">⌘/Ctrl + Enter</span>
        </div>
      </form>
    </Card>
  );
}

// Sorted by most recent activity -- lastActivityAt is bumped in the same
// batch as every new post, comment and reply, so a thread that someone just
// replied deep inside still rises to the top.
export default function ThreadList({ category, threads, posts, comments, replies, roster, onOpenThread, onCreateThread }) {
  const rows = useMemo(() => {
    const postCounts = new Map();
    for (const p of posts) postCounts.set(p.threadId, (postCounts.get(p.threadId) || 0) + 1);
    const commentCounts = new Map();
    for (const c of [...comments, ...replies]) {
      commentCounts.set(c.threadId, (commentCounts.get(c.threadId) || 0) + 1);
    }
    return threads
      .map((t) => ({
        ...t,
        postCount: postCounts.get(t.id) || 0,
        commentCount: commentCounts.get(t.id) || 0,
      }))
      .sort((a, b) => (b.lastActivityAt || b.createdAt) - (a.lastActivityAt || a.createdAt));
  }, [threads, posts, comments, replies]);

  if (!category) {
    return (
      <EmptyState>
        Pick a category on the left, or add one, and the conversations in it show up here.
      </EmptyState>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>
          {category.name}
          {category.archived ? <span className="archived-tag">Archived</span> : null}
        </h1>
        <p>
          {rows.length === 0
            ? 'Nothing here yet.'
            : `${rows.length} thread${rows.length === 1 ? '' : 's'}, most recent first.`}
        </p>
      </div>

      <NewThreadForm onCreate={onCreateThread} />

      {rows.length === 0 ? (
        <EmptyState>No threads in this category yet -- start the first one.</EmptyState>
      ) : (
        <ul className="thread-list">
          {rows.map((thread) => (
            <li key={thread.id}>
              <Card className="thread-row">
                <button type="button" className="thread-open" onClick={() => onOpenThread(thread.id)}>
                  <h3>{thread.title}</h3>
                </button>
                <div className="thread-meta">
                  <Byline
                    name={thread.createdByName}
                    personId={thread.createdBy}
                    roster={roster}
                    at={thread.createdAt}
                    size="sm"
                  />
                  <span className="thread-counts">
                    <Count value={thread.postCount} label="post" />
                    <Count value={thread.commentCount} label="comment" />
                  </span>
                </div>
                <div className="thread-last">Last activity {relativeLabel(thread)}</div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function relativeLabel(thread) {
  const at = thread.lastActivityAt || thread.createdAt;
  return new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
