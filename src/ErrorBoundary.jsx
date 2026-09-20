import { Component } from 'react';

// React error boundaries have no hook equivalent -- a render error anywhere
// below this, uncaught, would otherwise white-screen the whole app with no
// way back in. Nothing here is lost when it trips: every write already
// landed in Firestore, so a reload picks the conversation back up.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled error in app render', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1 className="auth-title">Something went wrong</h1>
          <p className="auth-sub">
            The app hit an unexpected error. Nothing you posted was lost -- it's all on the server. Reload to pick
            back up.
          </p>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <p className="auth-error">{String(this.state.error.message || this.state.error)}</p>
        </div>
      </div>
    );
  }
}
