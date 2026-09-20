// Loads Google Identity Services (the modern "Sign in with Google" button +
// ID token flow) on demand. Deliberately not a static <script> tag in
// index.html -- it's only needed on the sign-in screen, not on every load.
let loadPromise;

export function loadGoogleIdentityServices() {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve(window.google);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('Could not load Google Sign-In.'));
    document.head.appendChild(script);
  });
  return loadPromise;
}
