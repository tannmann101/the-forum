import { useMemo, useState } from 'react';
import { Body, Byline, Card, Composer, EmptyState } from '../ui.jsx';

const byTime = (a, b) => a.createdAt - b.createdAt;

// One level of replies under a comment, and that's the floor -- there's no
// reply-to-reply, so a family disagreement can't turn into a thread that
// indents off the right edge of the screen.
function Reply({ reply, roster }) {
  return (
    <li className="reply">
      <Byline name={reply.authorName} personId={reply.authorId} roster={roster} at={reply.createdAt} size="sm" />
      <Body>{reply.body}</Body>
    </li>
  );
}

function Comment({ comment, replies, roster, onReply }) {
  const mine = replies.filter((r) => r.commentId === comment.id).sort(byTime);

  return (
    <li className="comment">
      <Byline name={comment.authorName} personId={comment.authorId} roster={roster} at={comment.createdAt} size="sm" />
      <Body>{comment.body}</Body>

      {mine.length > 0 ? <ul className="reply-list">{mine.map((r) => <Reply key={r.id} reply={r} roster={roster} />)}</ul> : null}

      <div className="reply-composer">
        <Composer
          prompt="Reply"
          submitLabel="Reply"
          placeholder={`Reply to ${comment.authorName}…`}
          rows={2}
          onSubmit={(body) => onReply(comment, body)}
        />
      </div>
    </li>
  );
}

function Post({ post, comments, replies, roster, onComment, onReply }) {
  const mine = comments.filter((c) => c.postId === post.id).sort(byTime);

  return (
    <Card className={`post ${post.isInitial ? 'is-initial' : ''}`}>
      <Byline
        name={post.authorName}
        personId={post.authorId}
        roster={roster}
        at={post.createdAt}
        trailing={post.isInitial ? <span className="initial-tag">Opening post</span> : null}
      />
      <Body>{post.body}</Body>

      {mine.length > 0 ? (
        <ul className="comment-list">
          {mine.map((comment) => (
            <Comment key={comment.id} comment={comment} replies={replies} roster={roster} onReply={onReply} />
          ))}
        </ul>
      ) : null}

      <div className="comment-composer">
        <Composer
          prompt="Add a comment"
          submitLabel="Comment"
          placeholder={`Comment on ${post.authorName}'s post…`}
          rows={2}
          onSubmit={(body) => onComment(post, body)}
        />
      </div>
    </Card>
  );
}

// Opening post at the top, then follow-up posts in the order they were
// written. Follow-up posts are untitled by design -- the thread has the
// title, and the posts under it are just the conversation continuing.
export default function ThreadView({
  thread,
  category,
  posts,
  comments,
  replies,
  roster,
  onBack,
  onAddPost,
  onAddComment,
  onAddReply,
}) {
  const [busyError, setBusyError] = useState('');

  const ordered = useMemo(() => {
    const mine = posts.filter((p) => p.threadId === thread.id).sort(byTime);
    // isInitial is authoritative, not "whichever is oldest" -- a clock skew
    // between two devices shouldn't be able to demote the opening post.
    const initial = mine.filter((p) => p.isInitial);
    const rest = mine.filter((p) => !p.isInitial);
    return [...initial, ...rest];
  }, [posts, thread.id]);

  const threadComments = useMemo(() => comments.filter((c) => c.threadId === thread.id), [comments, thread.id]);
  const threadReplies = useMemo(() => replies.filter((r) => r.threadId === thread.id), [replies, thread.id]);

  const guard = (fn) => async (...args) => {
    setBusyError('');
    try {
      await fn(...args);
    } catch (err) {
      console.error('Write failed', err);
      setBusyError("That didn't save. Check your connection and try again.");
      throw err;
    }
  };

  return (
    <div className="page thread-view">
      <button type="button" className="back-link" onClick={onBack}>
        ← {category?.name || 'Back'}
      </button>

      <div className="page-head">
        <h1>{thread.title}</h1>
        <p>
          Started by {thread.createdByName} · {new Date(thread.createdAt).toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      </div>

      {busyError ? <p className="composer-error page-error">{busyError}</p> : null}

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
              onComment={guard(onAddComment)}
              onReply={guard(onAddReply)}
            />
          ))}
        </div>
      )}

      <Card className="new-post-card">
        <Composer
          prompt="Add another post to this thread…"
          submitLabel="Post"
          placeholder="Keep the thread going…"
          rows={4}
          onSubmit={guard(onAddPost)}
        />
      </Card>
    </div>
  );
}
