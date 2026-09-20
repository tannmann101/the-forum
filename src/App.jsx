import { useState, useEffect, useMemo } from 'react';
import { signOut } from 'firebase/auth';
import AuthGate, { useAuthUser } from './AuthGate.jsx';
import { auth } from './firebase.js';
import { useForum } from './useForum.js';
import Sidebar from './Sidebar.jsx';
import ThreadList from './components/ThreadList.jsx';
import ThreadView from './components/ThreadView.jsx';
import ActivityLog from './pages/ActivityLog.jsx';
import SearchBar from './SearchBar.jsx';
import { peopleIn } from './lib/activity.js';

const PAGES = [
  { id: 'discussions', label: 'Discussions' },
  { id: 'activity', label: 'Activity Log' },
];

// Where the app sends you when you go back past its own first screen.
const HOME_SITE = 'https://thegardners.xyz';

const parseHash = () => {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (raw === 'activity') return { page: 'activity', threadId: null, focusId: null };
  if (raw.startsWith('t/')) {
    // #/t/<threadId> or #/t/<threadId>/<focusId> -- the focus id is how a
    // search result opens a thread scrolled to the exact post, comment or
    // reply that matched, and it survives a reload or a shared link.
    const [threadId, focusId] = raw.slice(2).split('/');
    return { page: 'discussions', threadId: threadId || null, focusId: focusId || null };
  }
  return { page: 'discussions', threadId: null, focusId: null };
};

const hashFor = ({ page, threadId, focusId }) => {
  if (page === 'activity') return '#/activity';
  if (!threadId) return '#/';
  return focusId ? `#/t/${threadId}/${focusId}` : `#/t/${threadId}`;
};

// Navigation lives in real browser history, not in React state. That's what
// makes the platform's own back gesture work -- the iOS/Android edge swipe,
// the Android hardware back button and the browser back button all just pop
// history, so one mechanism covers all of them and there's no custom touch
// handling to fight with the OS.
//
// On mount we replace the current entry with an "exit" marker and push the
// app's first screen on top of it. That guarantees there is always exactly
// one entry below the app, so backing out of the root screen lands on the
// marker and we send you to the family site -- which is the behaviour asked
// for, and happens whether or not you actually arrived from there.
function useRoute() {
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    if (!window.history.state?.forum) {
      window.history.replaceState({ forum: 'exit' }, '');
      window.history.pushState({ forum: 'app' }, '', hashFor(parseHash()));
    }

    const onPop = (event) => {
      if (event.state?.forum === 'exit') {
        window.location.replace(HOME_SITE);
        return;
      }
      setRoute(parseHash());
    };

    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // push adds a level you can come back from (opening a thread, opening the
  // activity log); replace swaps the current one (switching category), so
  // back doesn't have to walk through every sideways move.
  const navigate = (next, { replace = false } = {}) => {
    const resolved = { page: 'discussions', threadId: null, focusId: null, ...next };
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({ forum: 'app' }, '', hashFor(resolved));
    setRoute(resolved);
  };

  return [route, navigate];
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
    editThread,
    setThreadArchived,
    editPost,
    setPostArchived,
    editComment,
    deleteComment,
    editReply,
    deleteReply,
  } = forum;

  const [route, navigate] = useRoute();
  const { page, threadId: openThreadId, focusId } = route;
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);

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

  // Switching category replaces the history entry rather than adding one --
  // back should leave the app, not walk you through every category you
  // clicked on the way here.
  const selectCategory = (id) => {
    setSelectedCategoryId(id);
    navigate({ page: 'discussions', threadId: null }, { replace: true });
  };

  // A search hit knows which thread to open and which element to focus once
  // it's open; a category hit has neither, and just switches the sidebar.
  const openSearchResult = (hit) => {
    if (hit.categoryId) setSelectedCategoryId(hit.categoryId);
    navigate({ page: 'discussions', threadId: hit.threadId, focusId: hit.focusId });
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
              onClick={() => navigate({ page: p.id })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <SearchBar
          data={{ categories, threads, posts, comments, replies }}
          onSelect={openSearchResult}
        />

        <div className="nav-account">
          <span className="nav-email">{user.email}</span>
          <button type="button" className="link-btn" onClick={() => signOut(auth)}>
            Sign out
          </button>
        </div>

        {/* A real link, not a history trick: this leaves for the family
            site directly, wherever you are in the app. The back gesture
            still walks out level by level. */}
        <a className="home-btn" href={HOME_SITE} title="Back to thegardners.xyz">
          <span aria-hidden="true">←</span> Gardners
        </a>
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
            me={user.uid}
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
                me={user.uid}
                focusId={focusId}
                onBack={() => window.history.back()}
                handlers={{
                  onAddPost: (body) =>
                    addPost({ threadId: openThread.id, categoryId: openThread.categoryId, body }),
                  onAddComment: (post, body) =>
                    addComment({
                      postId: post.id,
                      threadId: openThread.id,
                      categoryId: openThread.categoryId,
                      body,
                      onAuthorName: post.authorName,
                    }),
                  onAddReply: (comment, body) =>
                    addReply({
                      commentId: comment.id,
                      postId: comment.postId,
                      threadId: openThread.id,
                      categoryId: openThread.categoryId,
                      body,
                      onAuthorName: comment.authorName,
                    }),
                  onEditThread: editThread,
                  onSetThreadArchived: setThreadArchived,
                  onEditPost: editPost,
                  onSetPostArchived: setPostArchived,
                  onEditComment: editComment,
                  onDeleteComment: deleteComment,
                  onEditReply: editReply,
                  onDeleteReply: deleteReply,
                }}
              />
            ) : (
              <ThreadList
                category={selectedCategory}
                threads={threads.filter((t) => t.categoryId === activeCategoryId)}
                posts={posts}
                comments={comments}
                replies={replies}
                roster={roster}
                onOpenThread={(id) => navigate({ page: 'discussions', threadId: id })}
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
