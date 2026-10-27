import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  FiBox, FiCheckCircle, FiBarChart2, FiDollarSign, FiPlus, FiClock, FiCheck, FiArrowRight,
  FiCreditCard, FiShield, FiCompass
} from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/money';
import VerificationChecklist from '../../components/VerificationChecklist.jsx';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function ProgressRing({ done, total }) {
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - (total ? done / total : 0));
  return (
    <div className="ring" role="img" aria-label={`${done} of ${total} steps complete`}>
      <svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true">
        <circle cx="30" cy="30" r={radius} className="ring__track" />
        <circle cx="30" cy="30" r={radius} className="ring__value" strokeDasharray={circumference} strokeDashoffset={offset} />
      </svg>
      <span className="ring__label">{done}/{total}</span>
    </div>
  );
}

// DashboardLayout (the parent route) already redirects to /onboarding if
// there's no creator profile, so this always renders with one.
export default function DashboardHome() {
  const { user, creator } = useAuth();
  const { security, startTour } = useOutletContext();
  const [products, setProducts] = useState(null);
  const [insights, setInsights] = useState(null);
  const [insightsError, setInsightsError] = useState(null);

  function loadInsights() {
    setInsightsError(null);
    api.get('/api/insights/me').then(setInsights).catch(err => setInsightsError(err.message));
  }

  useEffect(() => {
    api.get('/api/products/mine').then(setProducts).catch(() => setProducts([]));
    loadInsights();
  }, []);

  const publishedCount = products?.filter(p => p.status === 'published').length ?? '-';
  const productCount = products?.length ?? '-';

  // Security items first: they protect the money, so they sort ahead of
  // growth items while any of them is still open.
  const steps = useMemo(() => {
    const list = [
      { key: 'email', group: 'security', done: !!user?.email_verified_at, title: 'Verify your email', hint: 'Protects your account and lets you receive sale notices.', to: '/check-email', cta: 'Verify' },
      { key: 'payout', group: 'security', done: !!creator.payout_ecocash_number, title: 'Add a payout number', hint: 'Where your earnings are sent. Changing it later needs your password.', to: '/dashboard/settings#payouts', cta: 'Add' }
    ];
    if (security && !security.has_password) {
      list.push({ key: 'password', group: 'security', done: false, title: 'Set a password', hint: 'You signed in with a social account. A password lets you secure payouts.', to: '/forgot-password', cta: 'Set up' });
    }
    list.push(
      { key: 'profile', group: 'growth', done: !!creator.avatar_path && !!creator.bio, title: 'Complete your storefront profile', hint: 'A photo and a short bio make buyers trust you faster.', to: '/dashboard/settings#profile', cta: 'Edit' },
      { key: 'first', group: 'growth', done: typeof productCount === 'number' ? productCount > 0 : true, title: 'Create your first product', hint: 'Add a cover, set a price, attach what buyers receive.', to: '/dashboard/products/new', cta: 'Create' },
      { key: 'publish', group: 'growth', done: typeof publishedCount === 'number' ? publishedCount > 0 : true, title: 'Publish a product', hint: 'Drafts are invisible. Publish to get a shareable link.', to: '/dashboard/products', cta: 'Open' }
    );
    return list;
  }, [user, creator, security, productCount, publishedCount]);

  const doneCount = steps.filter(s => s.done).length;
  const openSteps = steps.filter(s => !s.done);
  const allDone = openSteps.length === 0;

  return (
    <div className="dash-home">
      <header className="dash-head">
        <div>
          <p className="section__eyebrow mono">YOUR STOREFRONT</p>
          <h1>{greeting()}, {creator.name.split(' ')[0]}</h1>
        </div>
        <Link to="/dashboard/products/new" className="btn btn--gold btn--sm">
          <FiPlus size={15} /> New product
        </Link>
      </header>

      <div className="stat-grid">
        <div className="card stat-tile">
          <span className="stat-tile__label"><FiCheckCircle size={13} /> Published</span>
          <span className="stat-tile__value">{publishedCount}</span>
        </div>
        <div className="card stat-tile">
          <span className="stat-tile__label"><FiBox size={13} /> Total listings</span>
          <span className="stat-tile__value">
            {productCount}
            {typeof productCount === 'number' && typeof publishedCount === 'number' && productCount > publishedCount && (
              <span className="muted" style={{ fontSize: '.7rem', fontWeight: 500 }}> ({productCount - publishedCount} draft{productCount - publishedCount === 1 ? '' : 's'})</span>
            )}
          </span>
        </div>
        <div className="card stat-tile">
          <span className="stat-tile__label"><FiDollarSign size={13} /> Revenue</span>
          <span className="stat-tile__value">{insights ? formatMoney(insights.revenue_minor, insights.currency) : '-'}</span>
        </div>
        <div className="card stat-tile">
          <span className="stat-tile__label"><FiBarChart2 size={13} /> Orders</span>
          <span className="stat-tile__value">{insights ? insights.order_count : '-'}</span>
        </div>
      </div>
      {insightsError && (
        <p className="error-text" style={{ marginTop: -14, marginBottom: 20 }}>
          Couldn't load revenue and order stats. <button onClick={loadInsights} className="mono" style={{ background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' }}>Retry</button>
        </p>
      )}

      {insights?.awaiting_action_count > 0 && (
        <Link to="/dashboard/orders" className="dash-alert">
          <FiClock size={18} aria-hidden="true" />
          <div>
            <p>{insights.awaiting_action_count} service order{insights.awaiting_action_count === 1 ? '' : 's'} waiting on you to deliver</p>
            <small>That money is held until you mark it delivered and the buyer confirms.</small>
          </div>
          <FiArrowRight size={16} aria-hidden="true" />
        </Link>
      )}

      <section className="card health" aria-labelledby="health-title">
        <div className="health__head">
          <ProgressRing done={doneCount} total={steps.length} />
          <div>
            <h2 id="health-title">{allDone ? 'Your store is set up and secure' : 'Finish setting up your store'}</h2>
            <p className="muted">
              {allDone
                ? 'Everything essential is done. Keep an eye on Orders and your Wallet.'
                : `${openSteps.length} step${openSteps.length === 1 ? '' : 's'} left. Security steps come first because they protect your earnings.`}
            </p>
          </div>
        </div>
        <ul className="health__list">
          {steps.map(step => (
            <li key={step.key} className={`health__item${step.done ? ' health__item--done' : ''}`}>
              <span className="health__tick" aria-hidden="true">{step.done ? <FiCheck size={13} /> : (step.group === 'security' ? <FiShield size={12} /> : null)}</span>
              <div className="health__text">
                <p>{step.title}{step.group === 'security' && !step.done && <em>Security</em>}</p>
                {!step.done && <small>{step.hint}</small>}
              </div>
              {!step.done && <Link to={step.to} className="health__cta">{step.cta} <FiArrowRight size={13} /></Link>}
            </li>
          ))}
        </ul>
      </section>

      <div className="dash-quick">
        <Link to="/dashboard/wallet" className="dash-quick__item"><FiCreditCard size={18} /><span><b>Wallet</b><small>Balance and payouts</small></span></Link>
        <Link to="/dashboard/insights" className="dash-quick__item"><FiBarChart2 size={18} /><span><b>Insights</b><small>What is selling</small></span></Link>
        <button type="button" className="dash-quick__item" onClick={startTour}><FiCompass size={18} /><span><b>Quick tour</b><small>Find your way around</small></span></button>
      </div>

      <VerificationChecklist />
    </div>
  );
}
