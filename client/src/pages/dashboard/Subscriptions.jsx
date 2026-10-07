import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FiUsers, FiDollarSign, FiRepeat } from 'react-icons/fi';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/money';

function formatDate(sqliteDatetime) {
  const d = new Date(sqliteDatetime.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_LABEL = {
  active: { text: 'Active', className: 'badge--green' },
  lapsed: { text: 'Lapsed', className: 'badge--neutral' },
  canceled: { text: 'Canceled', className: 'badge--neutral' }
};

// GET /api/subscriptions/creator, optionally scoped to one product via
// EditProduct.jsx's "View subscribers" link — the query param round-trips
// straight through to the API, no client-side filtering needed.
export default function Subscriptions() {
  const [params] = useSearchParams();
  const productId = params.get('product_id');
  const [subscriptions, setSubscriptions] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setSubscriptions(null);
    const qs = productId ? `?product_id=${productId}` : '';
    api.get(`/api/subscriptions/creator${qs}`).then(setSubscriptions).catch(err => setError(err.message));
  }, [productId]);

  if (error) return <p className="error-text">{error}</p>;

  if (!subscriptions) {
    return (
      <div>
        <h1 style={{ fontSize: '1.5rem', marginBottom: 24 }}>Subscriptions</h1>
        <div className="stat-grid">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card stat-tile">
              <div className="skeleton" style={{ height: 12, width: '60%' }} />
            </div>
          ))}
        </div>
        <div className="skeleton" style={{ height: 160, borderRadius: 'var(--radius)' }} />
      </div>
    );
  }

  const active = subscriptions.filter(s => s.status === 'active');
  // Rough MRR, not a real accounting figure, same "gross before fees"
  // honesty wallet.js's own numbers already use — the platform fee still
  // applies to each individual renewal the same as any other charge. Keep
  // currencies separate: adding USD and ZWG minor units has no meaning.
  const mrrByCurrency = active
    .filter(s => !s.canceled_at)
    .reduce((totals, s) => {
      totals[s.currency] = (totals[s.currency] || 0) + s.price_minor;
      return totals;
    }, {});
  const mrr = Object.entries(mrrByCurrency)
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(' + ') || formatMoney(0, 'USD');

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: 6 }}>Subscriptions</h1>
      <p className="muted" style={{ fontSize: '.88rem', marginBottom: 24 }}>
        {productId ? 'Subscribers to this product.' : 'Everyone subscribed to any of your recurring products.'}
      </p>

      <div className="stat-grid">
        <div className="card stat-tile">
          <span className="stat-tile__label"><FiUsers size={13} /> Active subscribers</span>
          <span className="stat-tile__value">{active.length}</span>
        </div>
        <div className="card stat-tile">
          <span className="stat-tile__label"><FiDollarSign size={13} /> Rough MRR</span>
          <span className="mono stat-tile__value">{mrr}</span>
        </div>
      </div>

      {subscriptions.length === 0 ? (
        <div className="empty-state">
          <FiRepeat size={26} color="var(--muted)" style={{ marginBottom: 10 }} />
          <strong>No subscribers yet.</strong>
          Once someone subscribes to a recurring product, they'll show up here.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {subscriptions.map(s => {
            const label = STATUS_LABEL[s.status] || { text: s.status, className: 'badge--neutral' };
            return (
              <div key={s.id} className="card card--pad" style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.buyer_name || s.buyer_email}
                  </p>
                  <p className="muted" style={{ fontSize: '.85rem' }}>
                    {s.product_title} &middot; subscribed since {formatDate(s.created_at)}
                  </p>
                  <Link to={`/@${s.creator_handle}/${s.product_slug}#issues-section`} className="muted" style={{ fontSize: '.8rem' }}>
                    View product issues
                  </Link>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p className="mono" style={{ fontWeight: 600 }}>{formatMoney(s.price_minor, s.currency)}/mo</p>
                  <span className={`badge ${label.className}`}>{label.text}</span>
                  <p className="muted" style={{ fontSize: '.78rem', marginTop: 2 }}>
                    {s.status === 'active' ? `Renews ${formatDate(s.current_period_end)}` : `Ended ${formatDate(s.current_period_end)}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
