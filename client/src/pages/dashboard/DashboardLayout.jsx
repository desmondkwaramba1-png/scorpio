import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, Navigate } from 'react-router-dom';
import { FiGrid, FiBox, FiFilm, FiShoppingBag, FiBarChart2, FiCreditCard, FiRepeat, FiSettings, FiCopy, FiCheck, FiExternalLink, FiBookOpen } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import Seal from '../../components/Seal.jsx';
import { SITE_HOST, SITE_ORIGIN } from '../../lib/site.js';
import TourGuide from '../../components/TourGuide.jsx';

// Grouped by what they're actually for, not just the order features
// shipped in: what you publish (Overview, then Products/Reels/Blog),
// what you're fulfilling (Orders/Subscriptions), then money
// (Insights/Wallet), Settings last - a real order to scan or swipe
// through, not just however the list happened to grow over time.
const TABS = [
  ['/dashboard', 'Overview', FiGrid],
  ['/dashboard/products', 'Products', FiBox],
  ['/dashboard/reels', 'Reels', FiFilm],
  ['/dashboard/blog', 'Blog', FiBookOpen],
  ['/dashboard/orders', 'Orders', FiShoppingBag],
  ['/dashboard/subscriptions', 'Subscriptions', FiRepeat],
  ['/dashboard/insights', 'Insights', FiBarChart2],
  ['/dashboard/wallet', 'Wallet', FiCreditCard],
  ['/dashboard/settings', 'Settings', FiSettings]
];

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
  const [runGuide, setRunGuide] = useState(false);

  useEffect(() => {
    if (!creator?.id) return;
    const guideKey = `scorpio_dashboard_tour_seen_${creator.id}`;
    if (localStorage.getItem(guideKey)) return;
    localStorage.setItem(guideKey, 'true');
    setRunGuide(true);
  }, [creator?.id]);

  // A buyer with no creator profile has no business seeing the seller
  // dashboard shell (tabs, products, wallet) at all, not even a broken/
  // empty version of it. Only the index route used to guard on this.
  if (!creator) return <Navigate to="/onboarding" replace />;

  return (
    <div className="dashboard-shell wrap">
      <TourGuide run={runGuide} setRun={setRunGuide} />
      <div className="card dashboard-profile">
        <div className="dashboard-profile__identity">
          <div className="dashboard-profile__avatar" style={{
            background: creator.avatar_path ? `url(${creator.avatar_path}) center/cover` : 'var(--green-dark)'
          }}>
            {!creator.avatar_path && creator.name.charAt(0).toUpperCase()}
          </div>
          <div className="dashboard-profile__details">
            <div className="dashboard-profile__name">
              <p>{creator.name}</p>
              {!!creator.verified && <Seal />}
            </div>
            {/* A long handle (up to 30 chars, HANDLE_RE's own limit)
                otherwise just got clipped raw by the card's edge with no
                ellipsis at all - confirmed live with a 21-char test handle. */}
            <p className="dashboard-profile__url mono muted">
              {SITE_HOST}/@{creator.handle}
            </p>
          </div>
        </div>
        <div className="dashboard-profile__actions">
          <CopyLinkButton handle={creator.handle} />
          <Link to={`/@${creator.handle}`} className="btn btn--ghost btn--sm">
            <FiExternalLink /> View storefront
          </Link>
        </div>
      </div>

      <nav className="tabs tabs--dense dashboard-tabs" aria-label="Creator dashboard">
        {TABS.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === '/dashboard'} className={({ isActive }) =>
            'tab' + (isActive ? ' tab--active' : '')}
            data-tour={to === '/dashboard' ? 'overview' : to.split('/').pop()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Icon size={13} /> {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
