# The Forum

A discussion board for the family. Categories hold threads, threads hold
posts, posts hold comments, comments hold one level of replies -- and every
single thing anyone creates is written into a permanent activity log you can
filter, chart, and export.

Sibling to [budget-ledger](https://github.com/tannmann101/budget-ledger) (the
Household Ledger) and [roc-workspace](https://github.com/tannmann101/roc-workspace)
(The Workshop): same stack, same patterns, same family allow-list.

## What's in it

**Discussions.** A category sidebar on the left with add / rename / archive;
archived categories collapse into their own section rather than disappearing.
The main panel lists that category's threads, most recently active first,
with author, timestamp and post/comment counts. Open one and you get the
opening post at the top, follow-up posts in order under it, comments nested
on any post, and replies nested one level under any comment. Inline composers
everywhere; ⌘/Ctrl + Enter posts.

**Activity Log** (`#/activity`). Every create, rename and archive anyone has
done, filterable by person, category, action type and date range, with a
per-person engagement chart over time (daily / weekly / monthly) and a CSV
export of whatever the filters are currently showing.

**Live sync.** Firestore `onSnapshot` listeners, not refresh-on-open. A post
appears on the other person's screen as it's written.

**Installable.** PWA with a service worker and icons; "Add to Home Screen"
gives it its own window.

## Data model

Six top-level Firestore collections:

| Collection | Fields |
|---|---|
| `categories` | `name`, `createdBy`, `createdByName`, `createdAt`, `archived`, `archivedAt`, `archivedBy`, `order` |
| `threads` | `categoryId`, `title`, `createdBy`, `createdByName`, `createdAt`, `lastActivityAt` |
| `posts` | `threadId`, `categoryId`, `authorId`, `authorName`, `body`, `isInitial`, `createdAt` |
| `comments` | `postId`, `threadId`, `categoryId`, `authorId`, `authorName`, `body`, `createdAt` |
| `replies` | `commentId`, `postId`, `threadId`, `categoryId`, `authorId`, `authorName`, `body`, `createdAt` |
| `activityLog` | `actorId`, `actorName`, `action`, `targetType`, `targetId`, `breadcrumb`, `categoryId`, `createdAt` |

Every create / rename / archive writes **one `activityLog` document in the
same `writeBatch` as the content write** (plus the thread's `lastActivityAt`
bump, when there is one). Either the whole action lands or none of it does,
so the log can't drift out of sync with the conversation. `scripts/test-rules.mjs`
asserts both halves of that: the real batch commits, and a batch with a
malformed log entry is rejected whole.

Two notes on that table:

- **`categoryId` on `activityLog`** isn't in the original sketch. The Activity
  Log filters by category, and matching an id is exact where matching the
  rendered breadcrumb string would break the first time someone renames a
  category. It's `null` for the handful of entries with no category (creating
  a category, for instance).
- **Starting a thread writes one log entry**, `thread.create`, not a
  `thread.create` plus a `post.create` for the opening post. A thread and its
  opening post are one action by one person; logging them separately would
  double-count starting a conversation in the engagement chart. The opening
  post is still a normal `posts` document, flagged `isInitial: true`.

Timestamps are epoch milliseconds (`Date.now()`), like the sibling apps'
`updatedAt` -- sortable and comparable with no `Timestamp` objects leaking
into render code.

## What can and can't change

Posts, comments, replies and log entries are **append-only** -- no edit, no
delete, not even a soft-delete flag. That's enforced in `firestore.rules`
(`allow update, delete: if false`), not just hidden in the UI, because "the
activity log is a permanent record" only holds if the conversation underneath
it can't be rewritten.

Categories are the one mutable thing: they can be renamed and
archived/unarchived, and the rules restrict updates to exactly those fields,
so a category's authorship can't be rewritten either. Nothing is ever
hard-deleted, so every breadcrumb in the log keeps pointing at something that
still exists.

Threads take exactly one kind of update: the `lastActivityAt` stamp the thread
list sorts on. Titles are fixed once written.

Out of scope for this build, deliberately: reactions, notifications, and
reply-to-reply nesting.

## Access

Google sign-in, with a hard-coded family allow-list in `firestore.rules` --
the same two addresses as the ledger and the workshop. Adding someone means
adding their address there and redeploying the rules; there's no in-app invite
flow on purpose. The rules also check that a write's `authorId`/`actorId`
matches the signed-in uid, so nobody can post or log activity under someone
else's name.

Sign-in uses Google Identity Services' in-page credential flow rather than
`signInWithPopup`/`signInWithRedirect`, for the same reason The Workshop does:
both of those correlate the attempt with the page through session storage,
which breaks once an installed iOS Home Screen app leaves its browsing context
for accounts.google.com and comes back.

## One-time cloud setup

The Forum needs its **own** Firebase project. Don't point it at the ledger's or
the workshop's -- deploying `firestore.rules` would overwrite theirs.

1. Firebase Console → **Add project** (e.g. `the-forum`). Analytics optional.
2. **Build → Firestore Database → Create database** (production mode, any region).
3. **Project settings → Your apps → Web (`</>`)** → register an app. Copy the
   `firebaseConfig` values into `liveConfig` in `src/firebase.js`.
4. **Authentication → Sign-in method → Google** → enable it. Expand
   **Web SDK configuration** and copy the **Web client ID** into
   `GOOGLE_CLIENT_ID` in `src/firebase.js`.
5. **Authentication → Settings → Authorized domains** → add
   `forum.thegardners.xyz` (and `localhost` if you want to sign in for real
   locally).
6. Deploy the rules: `npx firebase deploy --only firestore:rules --project <your-project-id>`.

Until step 3 is done the app shows a short setup screen instead of an opaque
Firebase stack trace.

## Running locally

```
npm install
npm run dev
```

### Against local emulators (no real Firebase needed)

Create `.env.local` with `VITE_USE_FIREBASE_EMULATOR=true` (it's gitignored --
see `.env.local.example`). Requires a Java runtime, installed once.

```
npm run emulators    # local Auth + Firestore emulators
npm run dev          # in another terminal
```

In emulator mode the sign-in screen shows a small account picker instead of
Google's button -- Google can't issue a credential against the emulator, so
there'd otherwise be no way in. That branch is compiled out of production
builds.

## Tests

```
npm test           # both suites
npm run test:activity   # pure logic, no emulator needed
npm run test:rules      # needs `npm run emulators` running
```

`test:activity` (`node --test`) covers the Activity Log's filtering, bucketing,
engagement series and CSV escaping -- all of it lives in `src/lib/activity.js`
and `src/lib/csv.js`, free of any Firestore or DOM reference, the same split
the Household Ledger uses for its simulation math.

`test:rules` drives the real rules file against the Firestore emulator: the
allow-list, each collection's schema, the append-only guarantees, and the
batch shape the app actually writes. 45 checks.

## Icons

`npm run icons` regenerates `public/icons/*` from `scripts/make-icons.mjs` --
no image library, just a small PNG writer over Node's zlib, so the mark is
re-derivable from source instead of being a checked-in binary nobody can edit.

## Deployment

Push to `main`. `.github/workflows/deploy.yml` builds and publishes to GitHub
Pages, same pipeline as the sibling apps. `public/CNAME` points the site at
`forum.thegardners.xyz`; `base`, `start_url` and `scope` are all `/` to match
(keep all three in sync if the domain ever changes).

Repo settings → Pages → **Source: GitHub Actions**, and a DNS `CNAME` record
for `forum` → `tannmann101.github.io`.
