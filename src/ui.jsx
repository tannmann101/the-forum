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
export function Byline({ name, personId, roster, at, size = 'md', trailing }) {
  return (
    <div className={`byline byline-${size}`}>
      <Avatar name={name} personId={personId} roster={roster} size={size} />
      <span className="byline-name">{name}</span>
      <time className="byline-time" dateTime={new Date(at).toISOString()} title={absoluteTime(at)}>
        {relativeTime(at)}
      </time>
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
  autoFocus = false,
  alwaysOpen = false,
  rows = 3,
}) {
  const [open, setOpen] = useState(alwaysOpen || autoFocus);
  const [body, setBody] = useState('');
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
      setBody('');
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
        {alwaysOpen ? null : (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setBody('');
              setError('');
              setOpen(false);
            }}
          >
            Cancel
          </button>
        )}
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
