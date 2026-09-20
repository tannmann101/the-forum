import { useState } from 'react';
import { MAX_CATEGORY_NAME } from './theme.js';

function CategoryRow({ category, active, count, me, onSelect, onRename, onArchive, onUnarchive }) {
  // Categories are creator-only to change. firestore.rules enforces the
  // same check against the stored document; hiding the buttons just keeps
  // the UI from offering something the database will refuse.
  const isMine = category.createdBy === me;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(category.name);

  if (renaming) {
    return (
      <li className="cat-row is-editing">
        <form
          className="cat-rename"
          onSubmit={(e) => {
            e.preventDefault();
            onRename(category.id, draft);
            setRenaming(false);
          }}
        >
          <input
            className="input"
            value={draft}
            maxLength={MAX_CATEGORY_NAME}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setDraft(category.name);
                setRenaming(false);
              }
            }}
            autoFocus
            aria-label={`Rename ${category.name}`}
          />
          <div className="cat-rename-actions">
            <button type="submit" className="btn-tiny">
              Save
            </button>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setDraft(category.name);
                setRenaming(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="cat-row">
      <button type="button" className={`cat-link ${active ? 'is-active' : ''}`} onClick={() => onSelect(category.id)}>
        <span className="cat-name">{category.name}</span>
        <span className="cat-count">{count}</span>
      </button>
      {isMine ? (
        <div className="cat-actions">
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setDraft(category.name);
              setRenaming(true);
            }}
          >
            Rename
          </button>
          {category.archived ? (
            <button type="button" className="link-btn" onClick={() => onUnarchive(category.id)}>
              Unarchive
            </button>
          ) : (
            <button type="button" className="link-btn" onClick={() => onArchive(category.id)}>
              Archive
            </button>
          )}
        </div>
      ) : null}
    </li>
  );
}

// Categories are never deleted, only archived -- so every thread, post and
// activity-log breadcrumb keeps pointing at something that still exists.
// Archived ones move to their own collapsed section rather than vanishing.
export default function Sidebar({
  categories,
  threadCounts,
  selectedId,
  me,
  onSelect,
  onAdd,
  onRename,
  onArchive,
  onUnarchive,
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const active = categories.filter((c) => !c.archived);
  const archived = categories.filter((c) => c.archived);

  const submitNew = (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft('');
    setAdding(false);
  };

  const rowProps = { me, onSelect, onRename, onArchive, onUnarchive };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <h2>Categories</h2>
        <button type="button" className="btn-tiny" onClick={() => setAdding((v) => !v)}>
          {adding ? '×' : '+ New'}
        </button>
      </div>

      {adding ? (
        <form className="cat-add" onSubmit={submitNew}>
          <input
            className="input"
            placeholder="Category name"
            value={draft}
            maxLength={MAX_CATEGORY_NAME}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setAdding(false);
            }}
            autoFocus
          />
          <button type="submit" className="btn-primary btn-small" disabled={!draft.trim()}>
            Add
          </button>
        </form>
      ) : null}

      {active.length === 0 ? (
        <p className="sidebar-empty">No categories yet. Add the first one to start a conversation.</p>
      ) : (
        <ul className="cat-list">
          {active.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              active={category.id === selectedId}
              count={threadCounts[category.id] || 0}
              {...rowProps}
            />
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <div className="archived-block">
          <button type="button" className="archived-toggle" onClick={() => setShowArchived((v) => !v)}>
            <span className={`caret ${showArchived ? 'is-open' : ''}`}>▸</span>
            Archived
            <span className="cat-count">{archived.length}</span>
          </button>
          {showArchived ? (
            <ul className="cat-list is-archived">
              {archived.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  active={category.id === selectedId}
                  count={threadCounts[category.id] || 0}
                  {...rowProps}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
