import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from 'firebase/firestore';

export const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';

// Safe to commit: these are public client identifiers, not secrets. Access
// is controlled by Firestore security rules + Google sign-in, not by hiding
// this config -- same as household-ledger and roc-workspace.
//
// SETUP: The Forum needs its OWN Firebase project (don't point it at the
// ledger's or the workshop's -- deploying firestore.rules would overwrite
// theirs). Create one, add a Web app, and paste its values here; see the
// "One-time cloud setup" section of the README for the full walkthrough.
// Until then the app shows a setup screen instead of a Firebase stack trace.
const PLACEHOLDER = 'REPLACE_WITH_YOUR_FIREBASE_';

const liveConfig = {
  apiKey: `${PLACEHOLDER}API_KEY`,
  authDomain: `${PLACEHOLDER}AUTH_DOMAIN`,
  projectId: `${PLACEHOLDER}PROJECT_ID`,
  storageBucket: `${PLACEHOLDER}STORAGE_BUCKET`,
  messagingSenderId: `${PLACEHOLDER}SENDER_ID`,
  appId: `${PLACEHOLDER}APP_ID`,
};

// The Google OAuth web client id, from Firebase Console -> Authentication ->
// Sign-in method -> Google -> Web SDK configuration. AuthGate renders
// Google's own button with it.
export const GOOGLE_CLIENT_ID = `${PLACEHOLDER}OAUTH_CLIENT_ID`;

export const isConfigured = useEmulator || !liveConfig.projectId.startsWith(PLACEHOLDER);

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
