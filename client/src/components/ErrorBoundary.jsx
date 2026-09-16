import { Component } from 'react';

const RELOAD_FLAG = 'scorpio_chunk_reload_at';

// Route-based code splitting (see App.jsx) means each page is its own JS
// file named after a content hash. Every time the app is redeployed, those
// hashes change and the old files stop existing on the server. A tab that
// was already open before the deploy, or one loading from a cached old
// index.html, tries to fetch a route by its old filename, gets a 404, and
// without this, React just throws and renders nothing: a blank page with
// no explanation. The fix isn't an error message, it's just a fresh load.
function isChunkLoadError(error) {
  const msg = String((error && error.message) || error || '');
  return /dynamically imported module|loading chunk|importing a module script failed|failed to fetch/i.test(msg);
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (isChunkLoadError(error)) {
      // Guard against a reload loop, if a genuinely broken chunk keeps
      // failing even after a fresh load, stop auto-reloading and just show
      // the fallback below instead of hammering the server forever.
      const last = Number(sessionStorage.getItem(RELOAD_FLAG) || 0);
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.error) {
      if (isChunkLoadError(this.state.error)) {
        return (
          <div className="wrap center-page" style={{ padding: 20 }}>
            <p style={{ color: 'var(--muted)' }}>Getting the latest version&hellip;</p>
          </div>
        );
      }
      return (
        <div className="wrap center-page" style={{ padding: 20 }}>
          <p style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>Something went wrong.</p>
          <p className="muted" style={{ marginBottom: 20 }}>Reloading usually fixes it.</p>
          <button className="btn btn--primary" onClick={() => window.location.reload()}>Reload page</button>
        </div>
      );
    }
    return this.props.children;
  }
}
