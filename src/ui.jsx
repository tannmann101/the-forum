import { useState, useRef, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import { ACTIONS, MAX_BODY, personColor } from './theme.js';
import { relativeTime, absoluteTime } from './lib/time.js';
import { parseBody, previewsFor } from './lib/links.js';
import { useAttachments } from './useAttachments.js';
import { MAX_PER_ITEM, formatBytes } from './lib/images.js';
import { IMAGE_ONLY_BODY } from './theme.js';

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
  // Attachments are opt-in per composer: a new post/comment/reply can
  // carry images, but the editor for an existing one can't change them.
  uid = null,
}) {
  const [open, setOpen] = useState(alwaysOpen || autoFocus);
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const attach = useAttachments(uid);
  const canAttach = Boolean(uid);

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
    // An image on its own is a perfectly good comment, so a body is only
    // required when nothing is attached.
    if ((!text && attach.items.length === 0) || busy) return;
    if (attach.uploading) {
      setError('Still uploading — one moment.');
      return;
    }
    if (text.length > MAX_BODY) {
      setError(`That's ${text.length.toLocaleString()} characters -- the limit is ${MAX_BODY.toLocaleString()}.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(text, attach.toMetadata());
      // The files now belong to the saved item, so clear the tray without
      // deleting them from the bucket.
      attach.reset(false);
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
        // Screenshots go to the clipboard, so pasting one straight into
        // the box is the shortest path from "look at this" to posted.
        onPaste={(e) => {
          if (!canAttach) return;
          const files = [...(e.clipboardData?.files || [])];
          if (files.length) {
            e.preventDefault();
            attach.add(files);
          }
        }}
      />

      {canAttach ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="visually-hidden"
            onChange={(e) => {
              attach.add(e.target.files);
              // Reset so picking the same file twice still fires onChange.
              e.target.value = '';
            }}
          />
          <AttachmentTray items={attach.items} onRemove={attach.remove} />
          {attach.error ? <p className="composer-error">{attach.error}</p> : null}
        </>
      ) : null}

      {error ? <p className="composer-error">{error}</p> : null}
      <div className="composer-actions">
        <button
          type="submit"
          className="btn-primary"
          disabled={busy || attach.uploading || (!body.trim() && attach.items.length === 0)}
        >
          {busy ? 'Posting…' : attach.uploading ? 'Uploading…' : submitLabel}
        </button>
        {canAttach ? (
          <button
            type="button"
            className="link-btn"
            disabled={attach.full}
            onClick={() => fileRef.current?.click()}
          >
            {attach.full ? `${MAX_PER_ITEM} images max` : 'Add image'}
          </button>
        ) : null}
        {onCancel || !alwaysOpen ? (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setBody(initialBody);
              setError('');
              // Abandoning the composer takes its uploads with it.
              attach.reset();
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

// Post/comment bodies are plain text, never HTML. URLs in them become
// links, but by building React elements from parsed segments -- nothing is
// ever passed to innerHTML, and only http/https survives safeUrl, so a
// body containing "javascript:..." stays words on a page.
export function Body({ children }) {
  const text = typeof children === 'string' ? children : '';
  const parts = useMemo(() => parseBody(text), [text]);

  // An image-only item carries a placeholder body to satisfy the rules'
  // non-empty check; showing it would be noise.
  if (text === IMAGE_ONLY_BODY) return null;

  return (
    <p className="body-text">
      {parts.map((part, i) =>
        part.type === 'link' ? (
          <a
            key={i}
            className="body-link"
            href={part.url}
            target="_blank"
            // noopener stops the opened page reaching back through
            // window.opener; noreferrer keeps the forum's URL out of the
            // other site's logs.
            rel="noopener noreferrer"
          >
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}

// One preview. Falls back to a plain domain chip when there is no
// thumbnail to show, or when the one we guessed at doesn't load -- a URL
// ending in .jpg isn't a promise that an image is actually there.
function Thumb({ preview, size }) {
  const [failed, setFailed] = useState(false);
  const showImage = preview.thumbnail && !failed;

  if (!showImage) {
    return (
      <a className="link-chip" href={preview.url} target="_blank" rel="noopener noreferrer">
        <span className="link-chip-domain">{preview.domain}</span>
        <span className="link-chip-go" aria-hidden="true">↗</span>
      </a>
    );
  }

  return (
    <a className={`link-thumb is-${size} is-${preview.kind}`} href={preview.url} target="_blank" rel="noopener noreferrer">
      <img
        src={preview.thumbnail}
        alt=""
        loading="lazy"
        // The thumbnail is fetched straight from whoever hosts it, so the
        // request reveals the reader's IP to that host either way; at
        // least don't also hand over which page they're reading.
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
      {preview.kind === 'video' ? <span className="link-play" aria-hidden="true">▶</span> : null}
      <span className="link-thumb-domain">{preview.domain}</span>
    </a>
  );
}

// The strip of previews under a body. Thumbnails are only possible where
// one can be derived without a server: a direct image URL, or a YouTube id.
// Reading Open Graph tags off an arbitrary page needs a backend this app
// doesn't have, so everything else gets a domain chip rather than a guess.
export function LinkPreviews({ text, size = 'md' }) {
  const previews = useMemo(() => previewsFor(text), [text]);
  if (previews.length === 0) return null;
  return (
    <div className={`link-previews is-${size}`}>
      {previews.map((preview) => (
        <Thumb key={preview.url} preview={preview} size={size} />
      ))}
    </div>
  );
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

// The strip of images queued on a composer, with upload progress. Each one
// can be pulled back out, which also cancels or deletes it in the bucket.
function AttachmentTray({ items, onRemove }) {
  if (items.length === 0) return null;
  return (
    <div className="attach-tray">
      {items.map((item) => (
        <div key={item.id} className={`attach-item is-${item.status}`}>
          <img src={item.previewUrl} alt="" />
          {item.status === 'uploading' ? (
            <span className="attach-progress" style={{ width: `${Math.round((item.progress || 0) * 100)}%` }} />
          ) : null}
          {item.status === 'error' ? <span className="attach-failed">{item.message || 'Failed'}</span> : null}
          <button
            type="button"
            className="attach-remove"
            onClick={() => onRemove(item.id)}
            aria-label={`Remove ${item.name}`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// Images attached to a saved post, comment or reply. Clicking opens the
// full-size original in a new tab -- the grid is a contact sheet, not the
// only way to see the photo.
export function Attachments({ items, size = 'md' }) {
  if (!items || items.length === 0) return null;
  return (
    <div className={`attachments is-${size} count-${Math.min(items.length, 4)}`}>
      {items.map((item) => (
        <a
          key={item.path || item.url}
          className="attachment"
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`${item.name || 'Image'}${item.size ? ` · ${formatBytes(item.size)}` : ''}`}
        >
          <img
            src={item.url}
            alt={item.name || ''}
            loading="lazy"
            // Known up front, so the grid reserves the right space instead
            // of reflowing as each image arrives.
            width={item.width || undefined}
            height={item.height || undefined}
          />
        </a>
      ))}
    </div>
  );
}

// The same attachment tray as the Composer's, for forms that aren't a
// Composer -- currently just "start a thread", which needs its own title
// field. Exposes upload state through a ref so the parent form can block
// submit while an upload is still in flight.
export const AttachmentPicker = forwardRef(function AttachmentPicker({ uid, onChange }, ref) {
  const attach = useAttachments(uid);
  const fileRef = useRef(null);

  useEffect(() => {
    onChange?.(attach.items);
  }, [attach.items, onChange]);

  useImperativeHandle(ref, () => ({
    uploading: attach.uploading,
    metadata: attach.toMetadata,
    clear: attach.reset,
  }), [attach.uploading, attach.toMetadata, attach.reset]);

  if (!uid) return null;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="visually-hidden"
        onChange={(e) => {
          attach.add(e.target.files);
          e.target.value = '';
        }}
      />
      <AttachmentTray items={attach.items} onRemove={attach.remove} />
      {attach.error ? <p className="composer-error">{attach.error}</p> : null}
      <div className="picker-actions">
        <button type="button" className="link-btn" disabled={attach.full} onClick={() => fileRef.current?.click()}>
          {attach.full ? `${MAX_PER_ITEM} images max` : 'Add image'}
        </button>
      </div>
    </>
  );
});
