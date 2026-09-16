import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { FiCompass, FiUsers, FiGrid, FiUser, FiLogIn, FiLogOut, FiShoppingBag, FiShoppingCart, FiSearch, FiPackage, FiChevronDown, FiMail, FiPlayCircle, FiBookOpen } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';

// A creator has two real destinations (their storefront dashboard, and
// their own purchase history as a buyer), the nav used to only ever show
// one ("Dashboard" replaced "Account" outright the moment a creator profile
// existed), so a seller who also buys things had no visible way back to
// their own orders. This folds both into one dropdown instead of picking a
// winner. A plain buyer has exactly one destination, so they keep the
// simple direct link, no dropdown needed for the common case.
function AccountMenu({ creator, logout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const initial = creator.name ? creator.name.charAt(0).toUpperCase() : 'A';

  return (
    <div className="nav__account" ref={ref}>
      <button
        type="button"
        className={`nav__account-trigger${open ? ' nav__account-trigger--active' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span
          className="nav__account-avatar"
          style={creator.avatar_path ? { backgroundImage: `url(${creator.avatar_path})` } : undefined}
        >
          {!creator.avatar_path && initial}
        </span>
        <span className="nav__account-trigger__label">Account</span>
        <FiChevronDown size={13} className="nav__account-trigger__chevron" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div className="nav__account-menu">
          <div className="nav__account-menu__header">
            <span
              className="nav__account-avatar nav__account-avatar--lg"
              style={creator.avatar_path ? { backgroundImage: `url(${creator.avatar_path})` } : undefined}
            >
              {!creator.avatar_path && initial}
            </span>
            <div className="nav__account-menu__who">
              <p className="nav__account-menu__name">{creator.name || 'Your storefront'}</p>
              {creator.handle && <p className="nav__account-menu__handle">@{creator.handle}</p>}
            </div>
          </div>
          <div className="nav__account-menu__divider" />
          <Link to="/dashboard" onClick={() => setOpen(false)} className="nav__account-menu__item">
            <FiGrid size={15} /> Dashboard
          </Link>
          <Link to="/account" onClick={() => setOpen(false)} className="nav__account-menu__item">
            <FiPackage size={15} /> My orders
          </Link>
          <div className="nav__account-menu__divider" />
          <button type="button" onClick={() => { setOpen(false); logout(); }} className="nav__account-menu__item nav__account-menu__item--danger">
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
    navigate(q ? `/discover?q=${encodeURIComponent(q)}` : '/discover');
  }

  // The only route to /check-email now that ProtectedRoute doesn't force
  // anyone there (see its comment, Resend is still unverified, so a hard
  // block there meant no new signup could ever get in at all). Without
  // this, a real logged-in-but-unverified user had no way to even find
  // the page that lets them verify or resend the email, not a real fix,
  // just a permanent nag instead of a wall.
  const showVerifyBanner = !loading && user && !user.email_verified_at && location.pathname !== '/check-email';

  return (
    <nav className="nav">
      {showVerifyBanner && (
        <div className="wrap nav__verify-banner">
          <FiMail size={14} />
          <span>Verify your email to keep your account secure.</span>
          <Link to="/check-email">Verify now</Link>
        </div>
      )}
      <div className="wrap nav__inner">
        <Link to="/" className="nav__brand">
          <span className="nav__name">Scorpio</span>
        </Link>

        <form onSubmit={submitSearch} className="nav__search">
          <FiSearch size={14} />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search products..." aria-label="Search products"
          />
        </form>

        <div className="nav__icons" style={{ justifySelf: 'end' }}>
          <NavLink to="/discover" className={({ isActive }) => 'nav__icon-link' + (isActive ? ' nav__icon-link--active' : '')}>
            <FiCompass /> <span>Discover</span>
          </NavLink>
          <NavLink to="/reels" className={({ isActive }) => 'nav__icon-link' + (isActive ? ' nav__icon-link--active' : '')}>
            <FiPlayCircle /> <span>Reels</span>
          </NavLink>
          <NavLink to="/creators" className={({ isActive }) => 'nav__icon-link' + (isActive ? ' nav__icon-link--active' : '')}>
            <FiUsers /> <span>Creators</span>
          </NavLink>
          <NavLink to="/blog" className={({ isActive }) => 'nav__icon-link' + (isActive ? ' nav__icon-link--active' : '')}>
            <FiBookOpen /> <span>Blog</span>
          </NavLink>
          {!loading && user && (
            <NavLink to="/cart" className={({ isActive }) => 'nav__icon-link' + (isActive ? ' nav__icon-link--active' : '')} style={{ position: 'relative' }}>
              <FiShoppingCart /> <span>Cart</span>
              {count > 0 && <span className="nav__cart-badge">{count}</span>}
            </NavLink>
          )}
          {!loading && user && creator && <AccountMenu creator={creator} logout={logout} />}
          {!loading && user && !creator && (
            <NavLink to="/account" className={({ isActive }) => 'nav__icon-link' + (isActive ? ' nav__icon-link--active' : '')}>
              <FiUser /> <span>Account</span>
            </NavLink>
          )}
          {!loading && user && !creator && (
            <button onClick={logout} className="nav__icon-link" style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
              <FiLogOut /> <span>Log out</span>
            </button>
          )}
          {!loading && !user && (
            <NavLink to="/login" className={({ isActive }) => 'nav__icon-link' + (isActive ? ' nav__icon-link--active' : '')}>
              <FiLogIn /> <span>Login</span>
            </NavLink>
          )}
          {!loading && !user && (
            <NavLink to="/login?role=creator" className="nav__icon-link nav__icon-link--cta">
              <FiShoppingBag /> <span>Start selling</span>
            </NavLink>
          )}
        </div>
      </div>
    </nav>
  );
}
