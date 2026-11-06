import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="not-found wrap">
      <h1>We couldn't find that page</h1>
      <p className="muted">The link may be old, or the page may have moved.</p>
      <div className="not-found__actions">
        <Link to="/discover" className="btn btn--cta">Browse products</Link>
        <Link to="/" className="btn btn--ghost">Go home</Link>
      </div>
    </div>
  );
}
