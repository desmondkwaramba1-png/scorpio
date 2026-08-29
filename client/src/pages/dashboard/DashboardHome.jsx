import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiBox, FiCheckCircle, FiBarChart2, FiDollarSign, FiPlus, FiClock } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/money';
import VerificationChecklist from '../../components/VerificationChecklist.jsx';

// DashboardLayout (the parent route) already redirects to /onboarding if
// there's no creator profile, so this always renders with one.
export default function DashboardHome() {
  const { creator } = useAuth();
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem' }}>Welcome back, {creator.name}</h1>
        <Link to="/dashboard/products/new" className="btn btn--gold btn--sm">
          <FiPlus size={15} /> New product
        </Link>
      </div>

      <div className="stat-grid">
        <div className="card stat-tile">
          <span className="stat-tile__label"><FiBox size={13} /> Products</span>
          <span className="stat-tile__value">{productCount}</span>
        </div>
        <div className="card stat-tile">
          <span className="stat-tile__label"><FiCheckCircle size={13} /> Published</span>
          <span className="stat-tile__value">{publishedCount}</span>
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
        <Link to="/dashboard/orders" className="card card--pad" style={{
          marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12,
          borderColor: 'var(--gold)', background: 'var(--gold-tint)'
        }}>
          <FiClock size={18} color="var(--gold-ink, var(--gold))" style={{ flexShrink: 0 }} />
          <div>
            <p style={{ fontWeight: 600 }}>
              {insights.awaiting_action_count} service order{insights.awaiting_action_count === 1 ? '' : 's'} waiting on you to deliver
            </p>
            <p className="muted" style={{ fontSize: '.85rem' }}>That money is held until you mark it delivered and the buyer confirms.</p>
          </div>
        </Link>
      )}

      <VerificationChecklist />

      {!creator.payout_ecocash_number && (
        <div className="card card--pad" style={{ marginBottom: 20 }}>
          <p style={{ fontWeight: 600, marginBottom: 6 }}>Add a payout number</p>
          <p className="muted" style={{ fontSize: '.9rem', marginBottom: 14 }}>
            You need an EcoCash number on file before you can withdraw earnings.
          </p>
          <Link to="/dashboard/settings" className="btn btn--ghost" style={{ fontSize: '.85rem' }}>Add payout details</Link>
        </div>
      )}

      {productCount === 0 && (
        <div className="card card--pad">
          <p style={{ fontWeight: 600, marginBottom: 6 }}>List your first product</p>
          <p className="muted" style={{ fontSize: '.9rem', marginBottom: 14 }}>
            Add a cover, set a price, and get a link you can share.
          </p>
          <Link to="/dashboard/products/new" className="btn btn--gold" style={{ fontSize: '.85rem' }}>New product</Link>
        </div>
      )}
    </div>
  );
}
