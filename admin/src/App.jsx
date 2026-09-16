import { useState } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { FiLock, FiGrid, FiUsers, FiShoppingBag, FiCreditCard, FiAlertTriangle, FiFlag, FiMessageSquare, FiLogOut, FiBookOpen } from 'react-icons/fi';
import { AdminProvider, useAdmin } from './context/AdminContext.jsx';
import Overview from './pages/Overview.jsx';
import Sellers from './pages/Sellers.jsx';
import Buyers from './pages/Buyers.jsx';
import Payouts from './pages/Payouts.jsx';
import Disputes from './pages/Disputes.jsx';
import Reports from './pages/Reports.jsx';
import Flagged from './pages/Flagged.jsx';
import Blog from './pages/Blog.jsx';
import BlogEditor from './pages/BlogEditor.jsx';

const TABS = [
  ['/', 'Overview', FiGrid],
  ['/sellers', 'Sellers', FiShoppingBag],
  ['/buyers', 'Buyers', FiUsers],
  ['/payouts', 'Payouts', FiCreditCard],
  ['/disputes', 'Disputes', FiAlertTriangle],
  ['/reports', 'Reports', FiMessageSquare],
  ['/flagged', 'Flagged', FiFlag],
  ['/blog', 'Blog', FiBookOpen]
];

function KeyGate() {
  const { setKey } = useAdmin();
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    // Verify the key actually works before committing to it, rather than
    // storing it optimistically and letting every subsequent page load
    // fail one at a time. This has to be its own direct fetch with the
    // just-typed `input` value — the shared adminFetch() reads adminKey
    // from AdminContext's React state via closure, which on this very
    // first check is still whatever it was before (null), not what was
    // just typed. Using it here meant the correct key always failed on
    // first entry, since the request went out with an empty key.
    try {
      const res = await fetch('/api/admin/overview', { headers: { 'X-Admin-Key': input } });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(res.status === 403 ? 'Invalid admin key.' : (data?.error || 'Could not verify the key.'));
      }
      setKey(input);
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="wrap" style={{ maxWidth: 380, padding: '80px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <FiLock size={28} color="var(--muted)" style={{ marginBottom: 10 }} />
        <h1 style={{ fontSize: '1.4rem' }}>SCORPIO Admin</h1>
        <p className="muted" style={{ fontSize: '.88rem', marginTop: 4 }}>Enter the platform admin key.</p>
      </div>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="admin_key">Admin key</label>
          <input id="admin_key" type="password" required value={input} onChange={e => setInput(e.target.value)} autoFocus />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn--primary btn--block" disabled={checking} type="submit">
          {checking ? 'Checking...' : 'Enter'}
        </button>
      </form>
    </div>
  );
}

function AdminShell() {
  const { adminKey, clearKey } = useAdmin();
  if (!adminKey) return <KeyGate />;

  return (
    <div className="wrap" style={{ padding: '32px 20px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: '1.5rem' }}>SCORPIO Admin</h1>
        <button onClick={clearKey} className="btn btn--ghost btn--sm"><FiLogOut size={14} /> Lock</button>
      </div>

      <nav className="tabs" style={{ marginBottom: 24 }}>
        {TABS.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) =>
            'tab' + (isActive ? ' tab--active' : '')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Icon size={15} /> {label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/sellers" element={<Sellers />} />
        <Route path="/buyers" element={<Buyers />} />
        <Route path="/payouts" element={<Payouts />} />
        <Route path="/disputes" element={<Disputes />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/flagged" element={<Flagged />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/new" element={<BlogEditor />} />
        <Route path="/blog/:id/edit" element={<BlogEditor />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <AdminProvider>
      <AdminShell />
    </AdminProvider>
  );
}
