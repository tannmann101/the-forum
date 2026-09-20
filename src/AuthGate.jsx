import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, signInWithCredential, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth, isConfigured, useEmulator, GOOGLE_CLIENT_ID } from './firebase.js';
import { loadGoogleIdentityServices } from './lib/googleIdentity.js';

export function useAuthUser() {
  const [user, setUser] = useState(undefined); // undefined = still checking, null = signed out
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  return user;
}

export function Centered({ children }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">{children}</div>
    </div>
  );
}

// Google's real button can't issue a credential against the Auth emulator,
// so local development would otherwise have no way in at all. The emulator
// accepts a hand-built "ID token" that's really just a JSON claims blob --
// this is the documented emulator shape, and the whole branch is compiled
// out of a production build because VITE_USE_FIREBASE_EMULATOR is inlined
// as false there.
const DEV_ACCOUNTS = [
  { uid: 'dev-tanner', name: 'Tanner', email: 'tannerwesgardner@gmail.com' },
  { uid: 'dev-rochelle', name: 'Rochelle', email: 'rochelleygardner@gmail.com' },
  { uid: 'dev-stranger', name: 'Nosy Neighbor', email: 'stranger@example.com' },
];

function DevSignIn({ onError }) {
  const signInAs = async (account) => {
    const claims = {
      sub: account.uid,
      email: account.email,
      email_verified: true,
      name: account.name,
    };
    try {
      await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify(claims)));
    } catch (err) {
      onError(err.message || 'Emulator sign-in failed.');
    }
  };

  return (
    <div className="dev-signin">
      <p className="auth-sub">Emulator mode -- pick an account:</p>
      {DEV_ACCOUNTS.map((account) => (
        <button key={account.uid} type="button" className="btn-secondary" onClick={() => signInAs(account)}>
          {account.name}
        </button>
      ))}
    </div>
  );
}

export default function AuthGate({ user, forbidden, children }) {
  const [error, setError] = useState('');
  const buttonRef = useRef(null);

  // Renders Google's own "Sign in with Google" button and hands back an ID
  // token through an in-page callback -- no page navigation, no popup
  // window. Both signInWithPopup and signInWithRedirect correlate the
  // sign-in attempt with this page via sessionStorage/a pending-redirect
  // record, which breaks once an installed iOS Home Screen web app leaves
  // its own browsing context for accounts.google.com and back. The Identity
  // Services credential flow never navigates away at all, so none of that
  // applies -- same reasoning (and the same hard-won fix) as The Workshop.
  useEffect(() => {
    if (user || !isConfigured || useEmulator) return undefined;
    let cancelled = false;

    loadGoogleIdentityServices()
      .then((google) => {
        if (cancelled || !buttonRef.current) return;
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async ({ credential }) => {
            setError('');
            try {
              await signInWithCredential(auth, GoogleAuthProvider.credential(credential));
            } catch (err) {
              setError(err.message || 'Sign-in failed.');
            }
          },
        });
        google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'filled_blue',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
        });
      })
      .catch((err) => setError(err.message || 'Could not load Google Sign-In.'));

    return () => {
      cancelled = true;
    };
  }, [user]);

  // A half-filled src/firebase.js would otherwise fail deep inside the SDK
  // with an opaque auth/invalid-api-key. Say what's actually missing instead.
  if (!isConfigured) {
    return (
      <Centered>
        <h1 className="auth-title">The Forum</h1>
        <p className="auth-sub">
          This build hasn't been pointed at a Firebase project yet. Fill in <code>src/firebase.js</code> with your
          project's web config and OAuth client id -- the README's &ldquo;One-time cloud setup&rdquo; section walks
          through it.
        </p>
      </Centered>
    );
  }

  if (user === undefined) {
    return (
      <Centered>
        <p className="auth-loading">loading…</p>
      </Centered>
    );
  }

  if (!user) {
    return (
      <Centered>
        <h1 className="auth-title">The Forum</h1>
        <p className="auth-sub">Sign in to join the family conversation.</p>
        {useEmulator ? <DevSignIn onError={setError} /> : <div ref={buttonRef} className="google-signin-btn" />}
        {error ? <p className="auth-error">{error}</p> : null}
      </Centered>
    );
  }

  if (forbidden) {
    return (
      <Centered>
        <h1 className="auth-title">Not authorized</h1>
        <p className="auth-sub">
          Signed in as <strong>{user.email}</strong>
        </p>
        <p className="auth-sub">The Forum is restricted to specific family accounts.</p>
        <button type="button" className="btn-secondary" onClick={() => signOut(auth)}>
          Sign out
        </button>
      </Centered>
    );
  }

  return children;
}
