import { Link } from 'react-router-dom';

// Rendered once, site-wide (see App.jsx), not just on the homepage the
// way this used to be, "Report an issue" needs to be reachable from
// every page, including for a logged-out visitor hitting something like
// "I can't log in," which a homepage-only footer couldn't guarantee.
export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer__inner">
        <span>Copyright {new Date().getFullYear()} SCORPIO</span>
        <Link to="/report" className="footer__link">Report an issue</Link>
        <Link to="/terms" className="footer__link">Terms</Link>
        <Link to="/privacy" className="footer__link">Privacy</Link>
        <span>Built for Zimbabwe. Pay with EcoCash.</span>
      </div>
    </footer>
  );
}
