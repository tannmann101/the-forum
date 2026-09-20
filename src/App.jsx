import { useState, useEffect, useMemo } from 'react';
import { signOut } from 'firebase/auth';
import AuthGate, { useAuthUser } from './AuthGate.jsx';
import { auth } from './firebase.js';
import { useForum } from './useForum.js';
import Sidebar from './Sidebar.jsx';
import ThreadList from './components/ThreadList.jsx';
import ThreadView from './components/ThreadView.jsx';
import ActivityLog from './pages/ActivityLog.jsx';
import { peopleIn } from './lib/activity.js';

const PAGES = [
  { id: 'discussions', label: 'Discussions' },
  { id: 'activity', label: 'Activity Log' },
];

// Two routes, and the URL hash is the router -- enough for two pages, and
// it means an installed PWA reopens where it was and a link to the activity
// log is a link someone can actually send. No router dependency.
function usePage() {
  const read = () => (window.location.hash.replace('#/', '') === 'activity' ? 'activity' : 'discussions');
  const [page, setPage] = useState(read);

  useEffect(() => {
    const onHashChange = () => setPage(read());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (next) => {
    window.location.hash = next === 'activity' ? '#/activity' : '#/';
    setPage(next);
  };

  return [page, navigate];
}

function Shell({ user }) {
  const forum = useForum(user);
  const {
    status,
    categories,
    threads,
    posts,
    comments,
    replies,
    activityLog,
    addCategory,
    renameCategory,
    setCategoryArchived,
    addThread,
    addPost,
    addComment,
    addReply,
  } = forum;

  const [page, navigate] = usePage();
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [openThreadId, setOpenThreadId] = useState(null);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name)),
    [categories],
  );

  // Land on the first live category rather than an empty panel, but never
  // override one the person actually picked. Derived during render rather
  // than synced in an effect, so the very first paint already has a
  // category selected instead of flashing an empty panel.
  const activeCategoryId = useMemo(() => {
    if (selectedCategoryId && sortedCategories.some((c) => c.id === selectedCategoryId)) {
      return selectedCategoryId;
    }
    const first = sortedCategories.find((c) => !c.archived) || sortedCategories[0];
    return first ? first.id : null;
  }, [selectedCategoryId, sortedCategories]);

  // Person colors are keyed to the full cast from the activity log, so
  // someone is the same color in a thread byline as in the engagement chart.
  const roster = useMemo(() => peopleIn(activityLog).map((p) => p.id), [activityLog]);

  const threadCounts = useMemo(() => {
    const counts = {};
    for (const t of threads) counts[t.categoryId] = (counts[t.categoryId] || 0) + 1;
    return counts;
  }, [threads]);

  if (status === 'forbidden') {
    return <AuthGate user={user} forbidden />;
  }

  const selectedCategory = sortedCategories.find((c) => c.id === activeCategoryId) || null;
  const openThread = openThreadId ? threads.find((t) => t.id === openThreadId) : null;
  const openThreadCategory = openThread ? sortedCategories.find((c) => c.id === openThread.categoryId) : null;

  const selectCategory = (id) => {
    setSelectedCategoryId(id);
    setOpenThreadId(null);
  };

  return (
    <div className="app-shell">
      <nav className="nav">
        <div className="nav-brand">The Forum</div>
        <div className="nav-links">
          {PAGES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`nav-link ${page === p.id ? 'is-active' : ''}`}
              onClick={() => navigate(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="nav-account">
          <span className="nav-email">{user.email}</span>
          <button type="button" className="link-btn" onClick={() => signOut(auth)}>
            Sign out
          </button>
        </div>
      </nav>

      {status === 'loading' ? (
        <main className="main">
          <p className="auth-loading">loading the forum…</p>
        </main>
      ) : status === 'error' ? (
        <main className="main">
          <p className="auth-error">Couldn't load the forum. Try refreshing.</p>
        </main>
      ) : page === 'activity' ? (
        <main className="main">
          <ActivityLog activityLog={activityLog} categories={sortedCategories} roster={roster} />
        </main>
      ) : (
        <div className="discussions-layout">
          <Sidebar
            categories={sortedCategories}
            threadCounts={threadCounts}
            selectedId={activeCategoryId}
            onSelect={selectCategory}
            onAdd={addCategory}
            onRename={renameCategory}
            onArchive={(id) => setCategoryArchived(id, true)}
            onUnarchive={(id) => setCategoryArchived(id, false)}
          />

          <main className="main">
            {openThread ? (
              <ThreadView
                thread={openThread}
                category={openThreadCategory}
                posts={posts}
                comments={comments}
                replies={replies}
                roster={roster}
                onBack={() => setOpenThreadId(null)}
                onAddPost={(body) =>
                  addPost({ threadId: openThread.id, categoryId: openThread.categoryId, body })
                }
                onAddComment={(post, body) =>
                  addComment({
                    postId: post.id,
                    threadId: openThread.id,
                    categoryId: openThread.categoryId,
                    body,
                    onAuthorName: post.authorName,
                  })
                }
                onAddReply={(comment, body) =>
                  addReply({
                    commentId: comment.id,
                    postId: comment.postId,
                    threadId: openThread.id,
                    categoryId: openThread.categoryId,
                    body,
                    onAuthorName: comment.authorName,
                  })
                }
              />
            ) : (
              <ThreadList
                category={selectedCategory}
                threads={threads.filter((t) => t.categoryId === activeCategoryId)}
                posts={posts}
                comments={comments}
                replies={replies}
                roster={roster}
                onOpenThread={setOpenThreadId}
                onCreateThread={({ title, body }) =>
                  addThread({ categoryId: activeCategoryId, title, body })
                }
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const user = useAuthUser();
  return <AuthGate user={user}>{user && <Shell user={user} />}</AuthGate>;
}
