import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { FiCompass, FiUsers, FiGrid, FiUser, FiLogIn, FiLogOut, FiShoppingBag, FiShoppingCart, FiSun, FiMoon, FiSearch } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useCart } from '../context/CartContext.jsx';

export default function Nav() {
  const { user, creator, loading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { count } = useCart();
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const accountLink = creator
    ? { to: '/dashboard', label: 'Dashboard', icon: FiGrid }
    : { to: '/account', label: 'Account', icon: FiUser };

  function submitSearch(e) {
    e.preventDefault();
    navigate(q ? `/discover?q=${encodeURIComponent(q)}` : '/discover');
  }

  return (
    <nav className="nav">
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
          <NavLink to="/creators" className={({ isActive }) => 'nav__icon-link' + (isActive ? ' nav__icon-link--active' : '')}>
            <FiUsers /> <span>Creators</span>
          </NavLink>
          <button onClick={toggleTheme} className="nav__icon-link" style={{ border: 'none', background: 'none', cursor: 'pointer' }}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? <FiSun /> : <FiMoon />} <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
          {!loading && user && (
            <NavLink to="/cart" className={({ isActive }) => 'nav__icon-link' + (isActive ? ' nav__icon-link--active' : '')} style={{ position: 'relative' }}>
              <FiShoppingCart /> <span>Cart</span>
              {count > 0 && <span className="nav__cart-badge">{count}</span>}
            </NavLink>
          )}
          {!loading && user && (
            <NavLink to={accountLink.to} className={({ isActive }) => 'nav__icon-link' + (isActive ? ' nav__icon-link--active' : '')}>
              <accountLink.icon /> <span>{accountLink.label}</span>
            </NavLink>
          )}
          {!loading && user && (
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
