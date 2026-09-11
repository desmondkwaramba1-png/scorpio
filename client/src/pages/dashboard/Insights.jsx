import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiShoppingBag, FiDollarSign, FiBox, FiCheckCircle } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/money';

export default function Insights() {
  const { creator } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/insights/me').then(setData).catch(err => setError(err.message));
  }, []);

  if (error) return <p className="error-text">{error}</p>;

  if (!data) {
    return (
      <div>
        <h1 style={{ fontSize: '1.5rem', marginBottom: 24 }}>Insights</h1>
        <div className="stat-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card stat-tile">
              <div className="skeleton" style={{ height: 12, width: '60%' }} />
            </div>
          ))}
        </div>
        <div className="skeleton" style={{ height: 160, borderRadius: 'var(--radius)' }} />
      </div>
    );
  }

  const maxRevenue = Math.max(1, ...data.revenue_by_day.map(d => d.revenue_minor));

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: 24 }}>Insights</h1>

      <div className="stat-grid">
        <div className="card stat-tile">
          <span className="stat-tile__label"><FiShoppingBag size={13} /> Orders</span>
          <span className="stat-tile__value">{data.order_count}</span>
        </div>
        <div className="card stat-tile">
          <span className="stat-tile__label"><FiDollarSign size={13} /> Revenue</span>
          <span className="mono stat-tile__value">{formatMoney(data.revenue_minor, data.currency)}</span>
        </div>
        <div className="card stat-tile">
          <span className="stat-tile__label"><FiBox size={13} /> Products</span>
          <span className="stat-tile__value">{data.product_count}</span>
        </div>
        <div className="card stat-tile">
          <span className="stat-tile__label"><FiCheckCircle size={13} /> Published</span>
          <span className="stat-tile__value">{data.published_count}</span>
        </div>
      </div>

      <div className="card card--pad" style={{ marginBottom: 24 }}>
        <p style={{ fontWeight: 600, marginBottom: 16 }}>Revenue by day</p>
        {data.revenue_by_day.length === 0 && <p className="muted" style={{ fontSize: '.9rem' }}>No paid orders yet.</p>}
        {data.revenue_by_day.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
            {data.revenue_by_day.map(d => (
              <div key={d.day} title={`${d.day}: ${formatMoney(d.revenue_minor, data.currency)}`}
                style={{
                  flex: 1, background: 'var(--ink)', borderRadius: '4px 4px 0 0',
                  height: `${Math.max(6, (d.revenue_minor / maxRevenue) * 100)}%`
                }} />
            ))}
          </div>
        )}
      </div>

      <div className="card card--pad">
        <p style={{ fontWeight: 600, marginBottom: 16 }}>Top products</p>
        {data.top_products.length === 0 && <p className="muted" style={{ fontSize: '.9rem' }}>No paid orders yet.</p>}
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {data.top_products.map(p => (
            <Link key={p.id} to={`/@${creator.handle}/${p.slug}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.92rem' }}>
              <span>{p.title}</span>
              <span className="mono muted">{formatMoney(p.revenue_minor, data.currency)} &middot; {p.order_count} orders</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
