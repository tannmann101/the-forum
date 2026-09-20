import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from 'firebase/firestore';

export const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';

// Safe to commit: these are public client identifiers, not secrets. Access is
// controlled by Firestore security rules + Google sign-in, not by hiding this
// config -- same as household-ledger and roc-workspace.
//
// The Forum has its own Firebase project rather than sharing the ledger's or
// the workshop's, because `firebase deploy --only firestore:rules` replaces a
// project's entire ruleset -- deploying from here would delete theirs and
// break that app. The project is owned by a secondary Google account (the
// primary had hit Firebase's per-account project limit); that only affects
// who administers it in the console, never who can use the app. The
// allow-list in firestore.rules keys off the signed-in user's email, not the
// project owner. See the README's "The Firebase project" section for the rest.
const PLACEHOLDER = 'REPLACE_WITH_YOUR_FIREBASE_';

const liveConfig = {
  apiKey: 'AIzaSyBkGVgQeGXRSr_ooepZroc0vy-YKy1hNsg',
  authDomain: 'the-forum-d9cb4.firebaseapp.com',
  projectId: 'the-forum-d9cb4',
  storageBucket: 'the-forum-d9cb4.firebasestorage.app',
  messagingSenderId: '677107463937',
  appId: '1:677107463937:web:360ddb30622dcc56e00d00',
};

// The Google OAuth web client id, from Firebase Console -> Authentication ->
// Sign-in method -> Google -> Web SDK configuration. AuthGate renders
// Google's own button with it. It is NOT part of the firebaseConfig snippet
// the console hands you when you register a web app -- it lives on a
// different page, and is the one value that has to be copied separately.
export const GOOGLE_CLIENT_ID = '677107463937-9uhi1b4blkag1o6a5csveljms909sben.apps.googleusercontent.com';

const isPlaceholder = (value) => typeof value === 'string' && value.startsWith(PLACEHOLDER);

// Which piece of setup is still missing, if any. Checked per-value rather
// than once for the whole config: with only the firebaseConfig filled in, the
// app would sail past the setup screen and then render a Google button that
// silently fails on an unknown client id. Naming the missing piece is a lot
// more use than that.
export const setupNeeded = useEmulator
  ? null
  : isPlaceholder(liveConfig.projectId)
    ? 'firebase-config'
    : isPlaceholder(GOOGLE_CLIENT_ID)
      ? 'oauth-client-id'
      : null;

export const isConfigured = setupNeeded === null;

const firebaseConfig = useEmulator
  ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-the-forum' }
  : liveConfig;

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// .env.local sets VITE_USE_FIREBASE_EMULATOR=true so local development never touches the real project.
if (useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
