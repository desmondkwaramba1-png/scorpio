import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { FiGrid, FiLogOut, FiShoppingBag, FiSearch, FiPackage, FiChevronDown, FiMail } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { ACTIVE_CATEGORIES } from '../lib/launchScope.js';

const LINKS = [
  { to: '/discover', label: 'Discover' },
  { to: '/reels', label: 'Reels' },
  { to: '/creators', label: 'Creators' },
  { to: '/blog', label: 'Blog' },
];

function Avatar({ user, creator, initial, large }) {
  const image = creator?.avatar_path || user?.avatar_url;
  return (
    <span className={`nav__avatar${large ? ' nav__avatar--lg' : ''}`} style={image ? { backgroundImage: `url(${image})` } : undefined}>
      {!image && initial}
    </span>
  );
}

// A creator has two destinations (their dashboard and their own purchases),
// so both live in one account menu instead of one replacing the other.
function AccountMenu({ user, creator, logout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();

  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    function onClickOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClickOutside); document.removeEventListener('keydown', onKey); };
  }, []);

  const accountName = creator?.name || user?.name || user?.username || 'Your account';
  const initial = accountName.charAt(0).toUpperCase();

  return (
    <div className="nav__account" ref={ref}>
      <button type="button" className="nav__account-trigger" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="Account menu">
        <Avatar user={user} creator={creator} initial={initial} />
        <FiChevronDown size={14} className="nav__account-chevron" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div className="nav__account-menu">
          <div className="nav__account-menu__header">
            <Avatar user={user} creator={creator} initial={initial} large />
            <div className="nav__account-menu__who">
              <p className="nav__account-menu__name">{accountName}</p>
              <p className="nav__account-menu__handle">{creator?.handle ? `@${creator.handle}` : user?.email}</p>
            </div>
          </div>
          {creator && <Link to="/dashboard" className="nav__account-menu__item"><FiGrid size={15} /> Dashboard</Link>}
          <Link to="/account" className="nav__account-menu__item"><FiPackage size={15} /> {creator ? 'My orders' : 'My account and orders'}</Link>
          <button type="button" onClick={() => { setOpen(false); logout(); }} className="nav__account-menu__item">
            <FiLogOut size={15} /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Nav() {
  const { user, creator, loading, logout } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState('');

  function submitSearch(e) {
    e.preventDefault();
    navigate(q.trim() ? `/discover?q=${encodeURIComponent(q.trim())}` : '/discover');
  }

  async function doLogout() { await logout(); navigate('/'); }

  // Unverified users can browse, so the way to verify is always one tap away.
  const showVerifyBanner = !loading && user && !user.email_verified_at && location.pathname !== '/check-email';
  const sellHref = user ? (creator ? '/dashboard' : '/onboarding') : '/login?role=creator';
  const linkClass = ({ isActive }) => 'nav__link' + (isActive ? ' nav__link--active' : '');

  return (
    <nav className="nav" aria-label="Main">
      {showVerifyBanner && (
        <div className="nav__verify-banner">
          <FiMail size={14} />
          <span>Verify your email to keep your account secure.</span>
          <Link to="/check-email">Verify now</Link>
        </div>
      )}
      <div className="wrap nav__inner">
        <Link to="/" className="nav__brand" aria-label="Scorpio home">
          <span className="nav__name">Scorpio</span>
        </Link>

        <form onSubmit={submitSearch} className="nav__search" role="search">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search guides, templates and courses" aria-label="Search products" />
          <button type="submit" className="nav__search-btn" aria-label="Search"><FiSearch size={19} /></button>
        </form>

        <div className="nav__actions">
          {!loading && user && <AccountMenu user={user} creator={creator} logout={doLogout} />}
          {!loading && !user && <Link to="/login" className="nav__login">Log in</Link>}
          {!loading && user && (
            <NavLink to="/cart" className="nav__icon-btn" aria-label={count > 0 ? `Cart, ${count} items` : 'Cart'}>
              <FiShoppingBag size={21} />
              {count > 0 && <span className="nav__cart-badge">{count}</span>}
            </NavLink>
          )}
          {!loading && (
            <Link to={sellHref} className="btn nav__cta">
              {creator ? 'Dashboard' : <><span className="nav__cta-long">Start selling</span><span className="nav__cta-short">Sell</span></>}
            </Link>
          )}
        </div>
      </div>

      {/* The belt: every section in one row that fits the screen. */}
      <div className="nav__belt">
        <div className="wrap nav__belt-inner">
          <NavLink to="/" end className={linkClass}>Home</NavLink>
          {LINKS.map(l => <NavLink key={l.to} to={l.to} className={linkClass}>{l.label}</NavLink>)}
          <span className="nav__belt-cats">
            {ACTIVE_CATEGORIES.map(c => <Link key={c.value} to={`/discover?category=${c.value}`} className="nav__link">{c.label}</Link>)}
          </span>
        </div>
      </div>
    </nav>
  );
}