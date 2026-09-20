import { useState, useRef, useEffect } from 'react';
import { ACTIONS, MAX_BODY, personColor } from './theme.js';
import { relativeTime, absoluteTime } from './lib/time.js';

export function Card({ className = '', children, ...rest }) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function EmptyState({ children }) {
  return <div className="empty-state">{children}</div>;
}

// Initials on a per-person color chip. The roster is the sorted list of
// person ids the color assignment is keyed to, so someone's color is the
// same in a thread as it is in the activity chart.
export function Avatar({ name, personId, roster = [], size = 'md' }) {
  const initials = (name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <span className={`avatar avatar-${size}`} style={{ background: personColor(personId, roster) }} aria-hidden="true">
      {initials}
    </span>
  );
}

// "Every item shows author name + relative timestamp." One component, used
// by posts, comments and replies alike, so they can't drift apart.
export function Byline({ name, personId, roster, at, editedAt, size = 'md', trailing }) {
  return (
    <div className={`byline byline-${size}`}>
      <Avatar name={name} personId={personId} roster={roster} size={size} />
      <span className="byline-name">{name}</span>
      <time className="byline-time" dateTime={new Date(at).toISOString()} title={absoluteTime(at)}>
        {relativeTime(at)}
      </time>
      {/* Edits are marked rather than silent -- the activity log records
          them too, but someone reading the thread shouldn't have to go
          looking to find out the text changed after it was written. */}
      {editedAt ? (
        <span className="edited-tag" title={`Edited ${absoluteTime(editedAt)}`}>
          edited
        </span>
      ) : null}
      {trailing}
    </div>
  );
}

export function ActionPill({ action }) {
  const meta = ACTIONS[action];
  if (!meta) return <span className="action-pill">{action}</span>;
  return (
    <span className="action-pill" style={{ background: meta.soft, color: meta.color }}>
      {meta.label}
    </span>
  );
}

// The one composer used for a new post, a new comment and a new reply.
// Collapsed to a single prompt line until clicked, because a thread with
// an always-open textarea under every comment is unreadable.
export function Composer({
  prompt,
  submitLabel,
  placeholder,
  onSubmit,
  onCancel,
  initialBody = '',
  autoFocus = false,
  alwaysOpen = false,
  rows = 3,
}) {
  const [open, setOpen] = useState(alwaysOpen || autoFocus);
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (open && !alwaysOpen) textareaRef.current?.focus();
  }, [open, alwaysOpen]);

  if (!open) {
    return (
      <button type="button" className="composer-prompt" onClick={() => setOpen(true)}>
        {prompt}
      </button>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    if (text.length > MAX_BODY) {
      setError(`That's ${text.length.toLocaleString()} characters -- the limit is ${MAX_BODY.toLocaleString()}.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(text);
      // An editor keeps whatever it saved; a new-item composer empties.
      if (!initialBody) setBody('');
      if (!alwaysOpen) setOpen(false);
    } catch (err) {
      console.error('Failed to post', err);
      setError("That didn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        ref={textareaRef}
        className="input composer-body"
        rows={rows}
        placeholder={placeholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        // Cmd/Ctrl+Enter submits -- plain Enter has to stay a newline in a
        // discussion app where paragraphs are the point.
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(e);
        }}
      />
      {error ? <p className="composer-error">{error}</p> : null}
      <div className="composer-actions">
        <button type="submit" className="btn-primary" disabled={busy || !body.trim()}>
          {busy ? 'Posting…' : submitLabel}
        </button>
        {onCancel || !alwaysOpen ? (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setBody(initialBody);
              setError('');
              setOpen(alwaysOpen);
              onCancel?.();
            }}
          >
            Cancel
          </button>
        ) : null}
        <span className="composer-hint">⌘/Ctrl + Enter</span>
      </div>
    </form>
  );
}

// Post/comment bodies are plain text, never HTML -- they're rendered
// through React's normal escaping with whitespace preserved by CSS, so
// there is no injection surface and no markdown surprises.
export function Body({ children }) {
  return <p className="body-text">{children}</p>;
}

export function Count({ value, label }) {
  return (
    <span className="count">
      <strong>{value}</strong> {label}
      {value === 1 ? '' : 's'}
    </span>
  );
}

// The small "Edit / Archive / Delete" row under something you wrote.
// Rendered only for the owner, but that is a convenience, not the security
// boundary -- firestore.rules checks ownership against the stored document,
// so hiding these buttons is about keeping the UI honest, not about
// stopping anyone.
export function ItemActions({ actions }) {
  const live = actions.filter(Boolean);
  if (live.length === 0) return null;
  return (
    <div className="item-actions">
      {live.map((action) => (
        <button
          key={action.label}
          type="button"
          className={`link-btn ${action.danger ? 'is-danger' : ''}`}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

// A comment that was deleted while replies still hung off it. The document
// stays so its replies keep their context; only the text is gone.
export function Tombstone({ children }) {
  return <p className="tombstone">{children || 'Comment deleted.'}</p>;
}

// An archived post or thread. Archiving is how anything with other
// people's content under it goes away -- a delete would take their
// comments with it -- so the shell stays and the body is hidden.
export function ArchivedNote({ what, by, at, onUnarchive }) {
  return (
    <div className="archived-note">
      <span>
        {what} archived{by ? ` by ${by}` : ''}
        {at ? ` · ${relativeTime(at)}` : ''}
      </span>
      {onUnarchive ? (
        <button type="button" className="link-btn" onClick={onUnarchive}>
          Unarchive
        </button>
      ) : null}
    </div>
  );
}
