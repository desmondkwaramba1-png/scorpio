import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { FiCompass, FiUsers, FiGrid, FiUser, FiLogIn, FiLogOut, FiShoppingBag, FiShoppingCart, FiSearch, FiPackage, FiChevronDown, FiMail, FiPlayCircle, FiBookOpen, FiPlusCircle } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';

// A creator has two real destinations (their storefront dashboard, and
// their own purchase history as a buyer), the nav used to only ever show
// one ("Dashboard" replaced "Account" outright the moment a creator profile
// existed), so a seller who also buys things had no visible way back to
// their own orders. This folds both into one dropdown instead of picking a
// winner. Buyers use the same identity menu so sign-out stays discoverable
// on compact/mobile navigation too.
function AccountMenu({ user, creator, logout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const accountName = creator?.name || user?.name || user?.username || 'Your account';
  const initial = accountName.charAt(0).toUpperCase();

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
          style={creator?.avatar_path ? { backgroundImage: `url(${creator.avatar_path})` } : user?.avatar_url ? { backgroundImage: `url(${user.avatar_url})` } : undefined}
        >
          {!creator?.avatar_path && !user?.avatar_url && initial}
        </span>
        <span className="nav__account-trigger__label">Account</span>
        <FiChevronDown size={13} className="nav__account-trigger__chevron" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div className="nav__account-menu">
          <div className="nav__account-menu__header">
            <span
              className="nav__account-avatar nav__account-avatar--lg"
              style={creator?.avatar_path ? { backgroundImage: `url(${creator.avatar_path})` } : user?.avatar_url ? { backgroundImage: `url(${user.avatar_url})` } : undefined}
            >
              {!creator?.avatar_path && !user?.avatar_url && initial}
            </span>
            <div className="nav__account-menu__who">
              <p className="nav__account-menu__name">{accountName}</p>
              {creator?.handle
                ? <p className="nav__account-menu__handle">@{creator.handle}</p>
                : user?.email && <p className="nav__account-menu__handle">{user.email}</p>}
            </div>
          </div>
          <div className="nav__account-menu__divider" />
          {creator && (
            <Link to="/dashboard" onClick={() => setOpen(false)} className="nav__account-menu__item">
              <FiGrid size={15} /> Dashboard
            </Link>
          )}
          <Link to="/account" onClick={() => setOpen(false)} className="nav__account-menu__item">
            <FiPackage size={15} /> {creator ? 'My orders' : 'My account and orders'}
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
    <nav className="nav" aria-label="Main">
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

        <form onSubmit={submitSearch} className="nav__search" role="search">
          <FiSearch size={14} />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search products..." aria-label="Search products"
          />
        </form>

        <div className="nav__icons">
          {/* Phones only: the search field doesn't fit the one-row top bar, so search is an icon. */}
          <Link to="/discover?search=1" className="nav__icon-link nav__icon-link--search">
            <FiSearch /> <span>Search</span>
          </Link>
          <NavLink to="/discover" className={({ isActive }) => 'nav__icon-link nav__icon-link--discover' + (isActive ? ' nav__icon-link--active' : '')}>
            <FiCompass /> <span>Discover</span>
          </NavLink>
          <NavLink to="/reels" className={({ isActive }) => 'nav__icon-link' + (isActive ? ' nav__icon-link--active' : '')}>
            <FiPlayCircle /> <span>Reels</span>
          </NavLink>
          <NavLink to="/creators" className={({ isActive }) => 'nav__icon-link' + (isActive ? ' nav__icon-link--active' : '')}>
            <FiUsers /> <span>Creators</span>
          </NavLink>
          <NavLink to="/blog" className={({ isActive }) => 'nav__icon-link nav__icon-link--secondary' + (isActive ? ' nav__icon-link--active' : '')}>
            <FiBookOpen /> <span>Blog</span>
          </NavLink>
          {!loading && user && (
            <NavLink to="/cart" className={({ isActive }) => 'nav__icon-link' + (isActive ? ' nav__icon-link--active' : '')} style={{ position: 'relative' }}>
              <FiShoppingCart /> <span>Cart</span>
              {count > 0 && <span className="nav__cart-badge">{count}</span>}
            </NavLink>
          )}
          {!loading && user && <AccountMenu user={user} creator={creator} logout={async () => { await logout(); navigate('/'); }} />}
          {!loading && !user && (
            <NavLink to="/login" className={({ isActive }) => 'nav__icon-link' + (isActive ? ' nav__icon-link--active' : '')}>
              <FiLogIn /> <span>Log in</span>
            </NavLink>
          )}
          {!loading && !user && (
            <NavLink to="/login?role=creator" className="nav__icon-link nav__icon-link--cta">
              <FiPlusCircle /> <span>Sell</span>
            </NavLink>
          )}
        </div>
      </div>
    </nav>
  );
}
