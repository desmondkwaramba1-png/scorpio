import { Link } from 'react-router-dom';

// Site-wide, so "Report an issue" is reachable from every page, logged in or not.
export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer__grid">
        <div className="footer__brand">
          <Link to="/" className="nav__name" aria-label="Scorpio home">Scorpio</Link>
          <p>Digital products from Zimbabwean creators. Pay with EcoCash.</p>
        </div>
        <nav className="footer__col" aria-label="Shop">
          <p className="footer__heading">Shop</p>
          <Link to="/discover">Discover</Link>
          <Link to="/creators">Creators</Link>
          <Link to="/reels">Reels</Link>
        </nav>
        <nav className="footer__col" aria-label="Sell">
          <p className="footer__heading">Sell</p>
          <Link to="/login?role=creator">Start selling</Link>
          <Link to="/blog">Blog</Link>
        </nav>
        <nav className="footer__col" aria-label="Help">
          <p className="footer__heading">Help</p>
          <Link to="/report">Report an issue</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
      </div>
      <div className="wrap footer__base">
        <span>© {new Date().getFullYear()} SCORPIO</span>
        <span>Built for Zimbabwe</span>
      </div>
    </footer>
  );
}
