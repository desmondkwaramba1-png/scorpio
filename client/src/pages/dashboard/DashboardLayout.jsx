import { useState } from 'react';
import { NavLink, Outlet, Link, Navigate } from 'react-router-dom';
import { FiGrid, FiBox, FiFilm, FiShoppingBag, FiBarChart2, FiCreditCard, FiRepeat, FiSettings, FiCopy, FiCheck, FiExternalLink, FiBookOpen } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import Seal from '../../components/Seal.jsx';
import { SITE_HOST, SITE_ORIGIN } from '../../lib/site.js';

const TABS = [
  ['/dashboard', 'Overview', FiGrid],
  ['/dashboard/products', 'Products', FiBox],
  ['/dashboard/reels', 'Reels', FiFilm],
  ['/dashboard/orders', 'Orders', FiShoppingBag],
  ['/dashboard/subscriptions', 'Subscriptions', FiRepeat],
  ['/dashboard/insights', 'Insights', FiBarChart2],
  ['/dashboard/wallet', 'Wallet', FiCreditCard],
  ['/dashboard/settings', 'Settings', FiSettings]
];

// The blog is run off the same single ADMIN_KEY every /api/admin/* route
// has always used, not a real per-account role - there's no admin flag in
// the database to check. Showing this tab to every creator would send
// everyone else into a key prompt they have no way to satisfy, so it's
// gated on the one real account that operates the site.
const SITE_OWNER_HANDLE = 'dezt';

function CopyLinkButton({ handle }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(`${SITE_ORIGIN}/@${handle}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <button onClick={copy} className="btn btn--ghost btn--sm">
      {copied ? <FiCheck /> : <FiCopy />} {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}

export default function DashboardLayout() {
  const { creator } = useAuth();

  // A buyer with no creator profile has no business seeing the seller
  // dashboard shell (tabs, products, wallet) at all, not even a broken/
  // empty version of it. Only the index route used to guard on this.
  if (!creator) return <Navigate to="/onboarding" replace />;

  const tabs = creator.handle === SITE_OWNER_HANDLE
    ? [...TABS, ['/admin/blog', 'Blog', FiBookOpen]]
    : TABS;

  return (
    <div className="wrap" style={{ padding: '32px 20px 80px' }}>
      <div className="card card--pad" style={{
        marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
            background: creator.avatar_path ? `url(${creator.avatar_path}) center/cover` : 'var(--green-dark)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: '1.3rem'
          }}>
            {!creator.avatar_path && creator.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={{ fontWeight: 700, fontSize: '1.05rem' }}>{creator.name}</p>
              {!!creator.verified && <Seal />}
            </div>
            {/* A long handle (up to 30 chars, HANDLE_RE's own limit)
                otherwise just got clipped raw by the card's edge with no
                ellipsis at all - confirmed live with a 21-char test handle. */}
            <p className="mono muted" style={{ fontSize: '.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {SITE_HOST}/@{creator.handle}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <CopyLinkButton handle={creator.handle} />
          <Link to={`/@${creator.handle}`} className="btn btn--ghost btn--sm">
            <FiExternalLink /> View storefront
          </Link>
        </div>
      </div>

      <nav className="tabs">
        {tabs.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === '/dashboard'} className={({ isActive }) =>
            'tab' + (isActive ? ' tab--active' : '')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Icon size={15} /> {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
