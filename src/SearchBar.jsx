import { useEffect, useMemo, useRef, useState } from 'react';
import { flatten, searchForum } from './lib/search.js';

const TYPE_TAG = {
  category: 'Category',
  thread: 'Thread',
  post: 'Post',
  comment: 'Comment',
  reply: 'Reply',
};

// Snippets arrive as {text, match} segments rather than markup, so a match
// is highlighted without ever building HTML out of what someone typed.
function Snippet({ parts }) {
  return (
    <span className="result-snippet">
      {parts.map((part, i) => (part.match ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}
    </span>
  );
}

export default function SearchBar({ data, onSelect }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  // Everything is already in memory from the snapshot listeners, so this is
  // a scan over local arrays -- no Firestore round-trip, and no debounce
  // needed at a family forum's scale.
  const { groups, total } = useMemo(() => searchForum(query, data), [query, data]);
  const flat = useMemo(() => flatten(groups), [groups]);

  // Close on a click anywhere outside, and on Escape from anywhere.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (item) => {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    onSelect(item);
  };

  const onKeyDown = (e) => {
    if (!open || flat.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (c + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (c - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(flat[cursor] || flat[0]);
    }
  };

  const showPanel = open && query.trim().length > 0;

  return (
    <div className="search" ref={boxRef}>
      <input
        ref={inputRef}
        type="search"
        className="input search-input"
        placeholder="Search the forum…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          // Reset the highlighted row where the change actually happens,
          // rather than in an effect that would re-render a second time.
          setCursor(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        aria-label="Search the forum"
        aria-expanded={showPanel}
      />

      {showPanel ? (
        <div className="search-panel" role="listbox">
          {total === 0 ? (
            <p className="search-empty">No matches for “{query.trim()}”.</p>
          ) : (
            <>
              <p className="search-count">
                {total} {total === 1 ? 'match' : 'matches'}
              </p>
              {groups.map((group) => (
                <div key={group.type} className="search-group">
                  <div className="search-group-head">
                    {group.label}
                    <span className="search-group-count">{group.total}</span>
                  </div>
                  {group.items.map((item) => {
                    const index = flat.indexOf(item);
                    return (
                      <button
                        key={`${item.type}-${item.id}`}
                        type="button"
                        role="option"
                        aria-selected={index === cursor}
                        className={`search-result ${index === cursor ? 'is-cursor' : ''}`}
                        onMouseEnter={() => setCursor(index)}
                        onClick={() => choose(item)}
                      >
                        <span className="result-top">
                          <span className="result-title">{item.title}</span>
                          <span className="result-type">{TYPE_TAG[item.type]}</span>
                        </span>
                        <Snippet parts={item.snippet} />
                        <span className="result-where">
                          {item.where}
                          {item.author ? ` · ${item.author}` : ''}
                          {item.archived ? ' · archived' : ''}
                          {item.deleted ? ' · deleted' : ''}
                        </span>
                      </button>
                    );
                  })}
                  {/* Each group is capped so one noisy type can't bury the
                      others; say so rather than silently truncating. */}
                  {group.total > group.items.length ? (
                    <p className="search-more">
                      +{group.total - group.items.length} more {group.label.toLowerCase()} — keep typing to narrow it
                    </p>
                  ) : null}
                </div>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
