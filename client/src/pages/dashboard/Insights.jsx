import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiShoppingBag, FiDollarSign, FiBox, FiCheckCircle } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../lib/api';
import { formatMoney, formatTotals } from '../../lib/money';

const dayLabel = day => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// One series over a fixed 30 days: quiet days stay visible as a small tick, so
// the shape shows real time passing. The readout above doubles as the hover
// tooltip, and the hidden table gives screen readers the same numbers.
function RevenueChart({ days, currency }) {
  const [active, setActive] = useState(null);
  const { max, total, orders } = useMemo(() => ({
    max: Math.max(1, ...days.map(d => d.revenue_minor)),
    total: days.reduce((sum, d) => sum + d.revenue_minor, 0),
    orders: days.reduce((sum, d) => sum + d.orders, 0)
  }), [days]);
  const shown = active !== null ? days[active] : null;

  return (
    <div className="card card--pad rev-chart">
      <div className="rev-chart__head">
        <div>
          <p className="rev-chart__title">{shown ? dayLabel(shown.day) : 'Revenue, last 30 days'}</p>
          <p className="mono rev-chart__value">{formatMoney(shown ? shown.revenue_minor : total, currency)}</p>
        </div>
        <p className="muted rev-chart__orders">
          {shown ? shown.orders : orders} order{(shown ? shown.orders : orders) === 1 ? '' : 's'}
        </p>
      </div>
      {total === 0 ? (
        <p className="muted" style={{ fontSize: '.9rem' }}>No sales in the last 30 days yet.</p>
      ) : (
        <>
          <div className="rev-chart__plot" aria-hidden="true" onMouseLeave={() => setActive(null)}>
            {days.map((d, i) => (
              <div key={d.day} className="rev-chart__slot" onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}>
                <span
                  className={`rev-chart__bar${d.revenue_minor === 0 ? ' rev-chart__bar--empty' : ''}${active === i ? ' is-active' : ''}`}
                  style={d.revenue_minor ? { height: `${Math.max(4, (d.revenue_minor / max) * 100)}%` } : undefined}
                />
              </div>
            ))}
          </div>
          <div className="rev-chart__axis" aria-hidden="true"><span>{dayLabel(days[0].day)}</span><span>Today</span></div>
          <table className="sr-only">
            <caption>Revenue by day in {currency}</caption>
            <thead><tr><th>Day</th><th>Revenue</th><th>Orders</th></tr></thead>
            <tbody>
              {days.filter(d => d.orders > 0).map(d => (
                <tr key={d.day}><td>{dayLabel(d.day)}</td><td>{formatMoney(d.revenue_minor, currency)}</td><td>{d.orders}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

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
          <span className="mono stat-tile__value">{formatTotals(data.revenue_by_currency)}</span>
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

      <RevenueChart days={data.revenue_by_day} currency={data.currency} />

      <div className="card card--pad">
        <p style={{ fontWeight: 600, marginBottom: 16 }}>Top products</p>
        {data.top_products.length === 0 && <p className="muted" style={{ fontSize: '.9rem' }}>No paid orders yet.</p>}
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {data.top_products.map(p => (
            <Link key={`${p.id}-${p.currency}`} to={`/@${creator.handle}/${p.slug}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.92rem' }}>
              <span>{p.title}</span>
              <span className="mono muted">{formatMoney(p.revenue_minor, p.currency)} &middot; {p.order_count} order{p.order_count === 1 ? '' : 's'}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
