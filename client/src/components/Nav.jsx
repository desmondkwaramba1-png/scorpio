import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { FiGrid, FiLogOut, FiShoppingBag, FiSearch, FiPackage, FiChevronDown, FiMail, FiMenu, FiX } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';

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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setMenuOpen(false); }, [location.pathname, location.search]);
  // While the phone menu is open the page underneath shouldn't scroll.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  function submitSearch(e) {
    e.preventDefault();
    navigate(q ? `/discover?q=${encodeURIComponent(q)}` : '/discover');
  }

  async function doLogout() { await logout(); navigate('/'); }

  // Unverified users can browse, so the way to verify is always one tap away.
  const showVerifyBanner = !loading && user && !user.email_verified_at && location.pathname !== '/check-email';
  const sellHref = user ? (creator ? '/dashboard' : '/onboarding') : '/login?role=creator';
  const sellLabel = creator ? 'Dashboard' : 'Start selling';
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

        <div className="nav__links">
          {LINKS.map(l => <NavLink key={l.to} to={l.to} className={linkClass}>{l.label}</NavLink>)}
        </div>

        <div className="nav__actions">
          <form onSubmit={submitSearch} className="nav__search" role="search">
            <FiSearch size={15} aria-hidden="true" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" aria-label="Search products" />
          </form>
          <Link to="/discover?search=1" className="nav__icon-btn nav__icon-link--search" aria-label="Search">
            <FiSearch size={20} />
          </Link>
          {!loading && user && (
            <NavLink to="/cart" className="nav__icon-btn" aria-label={count > 0 ? `Cart, ${count} items` : 'Cart'}>
              <FiShoppingBag size={20} />
              {count > 0 && <span className="nav__cart-badge">{count}</span>}
            </NavLink>
          )}
          {!loading && user && <span className="nav__desktop-only"><AccountMenu user={user} creator={creator} logout={doLogout} /></span>}
          {!loading && !user && <Link to="/login" className="nav__login nav__desktop-only">Log in</Link>}
          {!loading && !(user && creator) && (
            <Link to={sellHref} className="btn btn--primary nav__cta nav__desktop-only">{sellLabel}</Link>
          )}
          <button type="button" className="nav__icon-btn nav__menu-btn" onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen} aria-controls="nav-sheet" aria-label={menuOpen ? 'Close menu' : 'Open menu'}>
            {menuOpen ? <FiX size={22} /> : <FiMenu size={22} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="nav__sheet" id="nav-sheet">
          <div className="nav__sheet-links">
            <NavLink to="/" end className={linkClass}>Home</NavLink>
            {LINKS.map(l => <NavLink key={l.to} to={l.to} className={linkClass}>{l.label}</NavLink>)}
          </div>
          <div className="nav__sheet-foot">
            {!loading && user ? (
              <>
                <div className="nav__sheet-who">
                  <Avatar user={user} creator={creator} initial={(creator?.name || user.name || user.username || '?').charAt(0).toUpperCase()} />
                  <span>{creator?.name || user.name || user.username}</span>
                </div>
                {creator && <Link to="/dashboard" className="nav__sheet-item"><FiGrid size={16} /> Dashboard</Link>}
                <Link to="/account" className="nav__sheet-item"><FiPackage size={16} /> {creator ? 'My orders' : 'My account and orders'}</Link>
                {!creator && <Link to={sellHref} className="nav__sheet-item"><FiShoppingBag size={16} /> Start selling</Link>}
                <button type="button" className="nav__sheet-item" onClick={doLogout}><FiLogOut size={16} /> Log out</button>
              </>
            ) : (
              <>
                <Link to={sellHref} className="btn btn--primary btn--block">Start selling</Link>
                <Link to="/login" className="btn btn--ghost btn--block">Log in</Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
