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

Everything is **creator-only**: you can edit and remove what you made, and
nothing else. `firestore.rules` enforces that by reading ownership off the
*stored* document, never the incoming one, so rewriting the owner field
can't be used to grant yourself the edit. The UI hides buttons you can't
use, but that's a convenience — the database is the boundary.

| | Edit | Remove |
|---|---|---|
| Category | rename | archive only, never deleted |
| Thread | retitle | archive only |
| Post | edit body | archive only |
| Comment | edit body | **deleted** — or tombstoned, see below |
| Reply | edit body | **deleted** |

Anything with other people's content hanging off it is **archived rather
than deleted**: deleting a category, thread or post would take someone
else's threads, posts or comments with it, and would leave activity-log
breadcrumbs pointing at nothing. Archived items keep their shell, hide
their body, and can be brought back by whoever owns them. Archived threads
collapse into their own section in the thread list, the same way archived
categories do in the sidebar.

Comments are the one thing that really deletes. A comment with replies
under it is **tombstoned** instead — the document stays so the replies keep
their context, with the body replaced by `[deleted]` — while a childless
one is removed outright. The rules permit both shapes (they can't count
replies); the client picks, and the activity log's breadcrumb records which
happened. Replies never nest further, so there's never anything underneath
to strand: they always delete for real.

Threads take one update anyone can make: the `lastActivityAt` stamp the
thread list sorts on. Requiring ownership there would mean a reply to
someone else's thread couldn't move it to the top of the list. That's a
separate rule path from the owner-only retitle/archive.

**The activity log is still append-only**, even though the content no
longer is. That's the point rather than a contradiction: edits and deletes
are themselves logged actions, so removing something records that it was
removed instead of quietly erasing that it ever existed. There are 18
actions, and `npm run test:activity` pins the list in `theme.js` against
`firestore.rules` so the two can't drift.

Out of scope, deliberately: reactions, notifications, and reply-to-reply
nesting.

## Attaching images

Posts, comments and replies can carry up to four images each. Pick them
with the **Add image** button, or paste a screenshot straight into the
composer — the clipboard path is the shortest route from "look at this" to
posted.

The bytes go to **Cloud Storage**; only metadata (a URL, a path, a size, the
dimensions) lands on the Firestore document. That split is deliberate rather
than tidy-minded: `useForum` holds whole collections in memory through
`onSnapshot`, so images inside those documents would mean every client
downloading every photo ever posted, on every load. Metadata is a few
hundred bytes per image, so the collections stay small.

Uploads start the moment a file is picked, not on submit, so posting is
instant once it's written. The cost of that is orphans — a file uploaded and
then abandoned has no document pointing at it — so removing an image, or
cancelling the composer, cancels the upload or deletes the object on the way
out.

**Before it leaves the device**, an image is resized to 2000px on its long
edge and re-encoded as JPEG at quality 0.85 — a phone photo is 12MP and
several megabytes, which nobody reading a family forum needs and which costs
upload time on mobile data. Animated GIFs pass through untouched, since
drawing one to a canvas would flatten it to a single frame, and the
re-encode is discarded if it comes out larger than the original.

### Rules

`storage.rules` mirrors `firestore.rules`: the same two family addresses,
and nothing else gets in.

- everything is written under `attachments/<uid>/`, so **ownership is the
  path** rather than a field that could be spoofed
- **images only** (`jpeg png gif webp avif heic heif`). Without that check
  the bucket is a general file host, and an `.html` uploaded to it would be
  served from the app's own storage domain
- **10 MB ceiling**, matching the client's — a unit test asserts the two
  lists and the cap agree, because otherwise they drift and a file passes
  the form only to be refused by the bucket
- only the uploader may delete, which is what the abandoned-upload cleanup
  relies on

`npm run test:storage` drives these against the Storage emulator: 26 checks
covering the allow-list, path scoping, every accepted and rejected content
type, the size ceiling, and deletes.

### One-time setup

Cloud Storage has to be turned on for the project (**Build → Storage → Get
started**), and on a project this new that requires the Blaze plan. The free
allowance — 5GB stored, 1GB/day downloaded — means a two-person forum
realistically costs nothing, but Blaze has no hard spending cap by default,
so set a budget alert.

Then deploy the rules alongside the Firestore ones:

```
npx firebase deploy --only firestore:rules,storage:rules --project the-forum-d9cb4
```

## Links in posts

URLs typed into a post, comment or reply become clickable, and get a
preview strip underneath where one can be derived.

Bodies stay **plain text** in Firestore — nothing about links is stored.
The rendering parses the text into plain and link segments and builds React
elements from them, so no markup is ever produced and there is no
innerHTML anywhere. Only `http` and `https` survive `safeUrl()`, so a body
containing `javascript:alert(1)` stays words on a page rather than becoming
a live href. Links open in a new tab with `rel="noopener noreferrer"`.

Because this is derived at render time rather than stored, every post
already written picks it up with no migration.

**Thumbnails, where possible:**

| Link | Shown |
|---|---|
| Direct image URL (`.jpg`, `.png`, `.gif`, `.webp`, `.avif`, `.bmp`, `.svg`) | the image itself |
| YouTube (`watch`, `youtu.be`, `shorts`, `embed`) | video thumbnail, derived from the id, with a play badge |
| Anything else | a chip showing the domain |

"Where possible" is a real limit rather than a hedge. A thumbnail for an
arbitrary page means reading its Open Graph tags, which needs a server to
fetch and parse the page — this app is static files plus Firestore, with no
Cloud Functions. Adding one would mean the Blaze plan and a new deploy
target, so generic links get an honest domain chip instead of a guess.

A URL ending in `.jpg` isn't a promise that an image is there, so a
thumbnail that fails to load falls back to the same domain chip rather than
leaving a broken image. Thumbnails are `loading="lazy"` and
`referrerPolicy="no-referrer"` — the request reveals the reader's IP to
whoever hosts the image either way, but it doesn't also hand over which
page they're reading.

## Search

A search box in the nav matches free text across **everything** -- category
names, thread titles, and post, comment and reply bodies -- and groups the
hits by what kind of thing they are. Selecting one opens the thread scrolled
to the exact post, comment or reply that matched, and flashes it.

It runs entirely in the browser against the snapshots `useForum` already
holds. Firestore has no substring or full-text query, so a server-side
version would mean standing up a second index (Algolia and friends) for a
corpus that fits in memory many times over. The matching logic lives in
`src/lib/search.js` with no Firestore or DOM reference, so
`npm run test:search` exercises it directly.

Matching is case-insensitive and partial-word (`fenc` finds `fence`), and
every whitespace-separated token has to appear somewhere -- so `fence quote`
finds a line containing both, in either order. Each group is capped at 8
results and says how many more there are rather than silently truncating.

The focused item is addressable: `#/t/<threadId>/<itemId>`. That survives a
reload and can be sent to someone else.

## Navigation and the back gesture

Navigation lives in real browser history rather than React state. Opening a
thread or the activity log pushes an entry; switching category replaces one,
so going back doesn't walk you through every category you clicked.

That means the platform's own back gesture just works — the iOS/Android
edge swipe, the Android hardware back button and the browser back button
all pop history, so one mechanism covers all of them and there's no custom
touch handling to fight with the OS.

There's also a **← Gardners** button in the top right that leaves for the
family site directly, from anywhere in the app -- a plain link, not a
history trick, for when you don't want to walk back out level by level.

On mount the app replaces the current history entry with an `exit` marker
and pushes its first screen on top. That guarantees exactly one entry below
the app, so backing out of the root screen lands on the marker and sends you
to `thegardners.xyz` — whether or not you actually arrived from there. So on
a phone: first swipe back out of a thread returns you to the thread list,
the next takes you to the family site.

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

## The Firebase project

The Forum runs on its own Firebase project, **`the-forum-d9cb4`**, rather than
sharing the ledger's or the workshop's. That's not fussiness:
`firebase deploy --only firestore:rules` replaces a project's *entire*
ruleset, so deploying from here into a sibling's project would delete that
app's rules and break it.

**The project is owned by a secondary Google account**, because the primary
account had hit Firebase's per-account project limit. That affects exactly one
thing -- which account you sign into the *console* with. It has no bearing on
who can use the app: the allow-list in `firestore.rules` matches the
**signed-in user's** email (`request.auth.token.email`), not the project
owner, so both family accounts work normally.

To avoid switching Google accounts every time you need the console, the
primary account is added to the project as an **Owner** under
*Project settings → Users and permissions*. `firebase deploy` then works while
logged in as the primary. The project still counts against the secondary
account's quota, which is the point.

One consequence worth knowing: if that secondary account ever lapses, the
project goes with it. The IAM Owner grant on the primary account is the thing
protecting you there -- don't remove it.

### Setting one up from scratch

1. Firebase Console → **Add project**. Analytics optional. (Out of project
   quota? Either add Firebase to an existing Google Cloud project, request a
   limit increase, or create it under another Google account and grant your
   main account Owner as above.)
2. **Build → Firestore Database → Create database** (production mode, any region).
3. **Project settings → Your apps → Web (`</>`)** → register an app. Copy the
   `firebaseConfig` values into `liveConfig` in `src/firebase.js`.
4. **Authentication → Sign-in method → Google** → enable it. Expand
   **Web SDK configuration** and copy the **Web client ID** into
   `GOOGLE_CLIENT_ID` in `src/firebase.js`. This is *not* part of the
   `firebaseConfig` snippet from step 3 -- it lives on a different page and is
   the one value you have to go find separately.
5. **Authentication → Settings → Authorized domains** → add
   `forum.thegardners.xyz` (and `localhost` if you want to sign in for real
   locally).
6. Deploy the rules: `npx firebase deploy --only firestore:rules --project the-forum-d9cb4`.

Step 6 is easy to skip and confusing to debug: without it the project keeps
Firestore's default rules, every read is denied, and the app looks broken
rather than unconfigured.

Steps 3 and 4 are checked separately at startup, so a build with the
`firebaseConfig` filled in but no client id says so explicitly instead of
rendering a Google button that fails on an unknown client id.

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
npm test           # every suite
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
