import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, Link, Navigate, useLocation } from 'react-router-dom';
import {
  FiGrid, FiBox, FiFilm, FiShoppingBag, FiBarChart2, FiCreditCard, FiRepeat, FiSettings,
  FiCopy, FiCheck, FiExternalLink, FiBookOpen, FiCompass, FiShield
} from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../lib/api';
import Seal from '../../components/Seal.jsx';
import { SITE_HOST, SITE_ORIGIN } from '../../lib/site.js';
import TourGuide from '../../components/TourGuide.jsx';

// Grouped by what each area is for: what you publish, what you're
// fulfilling, money, then the account itself.
const GROUPS = [
  { label: null, items: [['/dashboard', 'Overview', FiGrid]] },
  { label: 'Sell', items: [['/dashboard/products', 'Products', FiBox], ['/dashboard/reels', 'Reels', FiFilm], ['/dashboard/blog', 'Blog', FiBookOpen]] },
  { label: 'Fulfil', items: [['/dashboard/orders', 'Orders', FiShoppingBag], ['/dashboard/subscriptions', 'Subscriptions', FiRepeat]] },
  { label: 'Money', items: [['/dashboard/insights', 'Insights', FiBarChart2], ['/dashboard/wallet', 'Wallet', FiCreditCard]] },
  { label: 'Account', items: [['/dashboard/settings', 'Settings', FiSettings]] }
];
const ALL_TABS = GROUPS.flatMap(g => g.items);

const WIDE_QUERY = '(min-width: 960px)';

function useWide() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

// The sticky parts of the dashboard sit directly under the site's top bar.
// That bar changes height (email-verify banner, wrapped icons on small
// phones), so its real height is measured and published as --nav-h instead
// of hardcoding an offset that eventually lets something slide underneath.
function useTopBarOffset() {
  useLayoutEffect(() => {
    const bar = document.querySelector('.nav');
    if (!bar) return undefined;
    const apply = () => document.documentElement.style.setProperty('--nav-h', `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(bar);
    return () => { ro.disconnect(); document.documentElement.style.removeProperty('--nav-h'); };
  }, []);
}

function CopyLinkButton({ handle }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${SITE_ORIGIN}/@${handle}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked: nothing useful to do */ }
  }
  return (
    <button type="button" onClick={copy} className="dash-chip">
      {copied ? <FiCheck size={13} /> : <FiCopy size={13} />} {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}

function ProfileBlock({ creator }) {
  return (
    <div className="dash-profile">
      <div
        className="dash-profile__avatar"
        style={creator.avatar_path ? { backgroundImage: `url(${creator.avatar_path})` } : undefined}
        aria-hidden="true"
      >
        {!creator.avatar_path && creator.name.charAt(0).toUpperCase()}
      </div>
      <div className="dash-profile__text">
        <p className="dash-profile__name"><span>{creator.name}</span>{!!creator.verified && <Seal />}</p>
        <p className="dash-profile__url mono">{SITE_HOST}/@{creator.handle}</p>
      </div>
    </div>
  );
}

export default function DashboardLayout() {
  const { user, creator } = useAuth();
  const location = useLocation();
  const wide = useWide();
  const [runGuide, setRunGuide] = useState(false);
  const [security, setSecurity] = useState(null);
  const barRef = useRef(null);
  const guideKey = creator?.id ? `scorpio_dashboard_tour_seen_v2_${creator.id}` : null;

  useTopBarOffset();

  const refreshSecurity = useCallback(() => {
    api.get('/api/auth/security').then(setSecurity).catch(() => setSecurity(null));
  }, []);
  useEffect(() => { if (creator) refreshSecurity(); }, [creator, refreshSecurity]);

  // Keep the active tab in view on the phone bar after navigating.
  useEffect(() => {
    if (wide) return;
    barRef.current?.querySelector('.dash-tab--active')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [location.pathname, wide]);

  // A buyer with no creator profile has no business seeing the seller
  // dashboard shell at all. Only the index route used to guard on this.
  if (!creator) return <Navigate to="/onboarding" replace />;

  const securityAlerts = [
    !user?.email_verified_at,
    security && !security.has_password,
    !creator.payout_ecocash_number
  ].filter(Boolean).length;

  const startTour = () => setRunGuide(true);
  const tourAttr = (to) => (to === '/dashboard' ? 'overview' : to.split('/').pop());

  const renderLink = ([to, label, Icon]) => (
    <NavLink
      key={to}
      to={to}
      end={to === '/dashboard'}
      data-tour={tourAttr(to)}
      className={({ isActive }) => 'dash-tab' + (isActive ? ' dash-tab--active' : '')}
    >
      <Icon size={17} aria-hidden="true" />
      <span>{label}</span>
      {to === '/dashboard/settings' && securityAlerts > 0 && (
        <b className="dash-tab__dot" aria-label={`${securityAlerts} security item${securityAlerts === 1 ? '' : 's'} need attention`}>{securityAlerts}</b>
      )}
    </NavLink>
  );

  return (
    <div className="dash wrap">
      <TourGuide run={runGuide} setRun={setRunGuide} storageKey={guideKey} />

      {wide ? (
        <aside className="dash-side" aria-label="Creator dashboard">
          <ProfileBlock creator={creator} />
          <div className="dash-profile__actions">
            <CopyLinkButton handle={creator.handle} />
            <Link to={`/@${creator.handle}`} className="dash-chip"><FiExternalLink size={13} /> View store</Link>
          </div>
          <nav className="dash-nav">
            {GROUPS.map(group => (
              <div className="dash-nav__group" key={group.label || 'home'}>
                {group.label && <p className="dash-nav__label">{group.label}</p>}
                {group.items.map(renderLink)}
              </div>
            ))}
          </nav>
          <Link to="/dashboard/settings#security" className={`dash-trust${securityAlerts ? ' dash-trust--warn' : ''}`}>
            <FiShield size={16} />
            <span>
              <b>{securityAlerts ? 'Secure your account' : 'Account secured'}</b>
              <small>{securityAlerts ? `${securityAlerts} thing${securityAlerts === 1 ? '' : 's'} left to do` : 'Email, password and payout verified'}</small>
            </span>
          </Link>
          <button type="button" className="dash-tour" onClick={startTour}><FiCompass size={14} /> Take a quick tour</button>
        </aside>
      ) : (
        <div className="dash-top">
          <div className="dash-top__head">
            <ProfileBlock creator={creator} />
            <Link to={`/@${creator.handle}`} className="dash-chip"><FiExternalLink size={13} /> View store</Link>
          </div>
          <nav className="dash-bar" aria-label="Creator dashboard" ref={barRef}>
            {ALL_TABS.map(renderLink)}
          </nav>
        </div>
      )}

      <main className="dash-main">
        <Outlet context={{ security, refreshSecurity, startTour }} />
      </main>
    </div>
  );
}
