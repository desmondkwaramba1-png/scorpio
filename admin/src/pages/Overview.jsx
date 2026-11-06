import { useEffect, useState } from 'react';
import { FiUsers, FiShoppingBag, FiBox, FiDollarSign, FiTrendingUp, FiUserPlus, FiPercent } from 'react-icons/fi';
import { useAdmin } from '../context/AdminContext.jsx';
import { formatMoney } from '../lib/money';
import { SITE_ORIGIN } from '../lib/site';

// USD and ZiG are separate money, so each gets its own figure.
function moneyByCurrency(totals) {
  const entries = Object.entries(totals || {});
  if (entries.length === 0) return formatMoney(0, 'USD');
  return entries.map(([currency, minor]) => formatMoney(minor, currency)).join(' · ');
}

function StatTile({ icon: Icon, label, value, sub }) {
  return (
    <div className="card stat-tile">
      <span className="stat-tile__label"><Icon size={13} /> {label}</span>
      <span className="mono stat-tile__value">{value}</span>
      {sub && <span className="muted" style={{ fontSize: '.76rem', marginTop: 2 }}>{sub}</span>}
    </div>
  );
}

export default function Overview() {
  const { adminFetch } = useAdmin();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminFetch('/api/admin/overview').then(setData).catch(err => setError(err.message));
  }, [adminFetch]);

  if (error) return <p className="error-text">{error}</p>;
  if (!data) return <p className="muted">Loading...</p>;

  return (
    <div>
      <div className="stat-grid" style={{ marginBottom: 28 }}>
        <StatTile icon={FiDollarSign} label="Gross revenue" value={moneyByCurrency(data.gross_by_currency)}
          sub={`${moneyByCurrency(data.revenue_last_7_days_by_currency)} in the last 7 days, excluding refunds`} />
        <StatTile icon={FiPercent} label="Platform fees earned" value={moneyByCurrency(data.platform_fees_by_currency)} />
        <StatTile icon={FiShoppingBag} label="Paid orders" value={data.total_orders} sub={`${data.orders_last_7_days} in the last 7 days`} />
        <StatTile icon={FiBox} label="Products" value={data.published_products} sub={`${data.total_products} total, incl. drafts`} />
        <StatTile icon={FiUsers} label="Creators" value={data.total_creators} />
        <StatTile icon={FiUserPlus} label="New signups" value={data.signups_last_7_days} sub={`${data.signups_last_30_days} in the last 30 days`} />
      </div>

      <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <div>
          <h2 style={{ fontSize: '1.05rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FiTrendingUp size={16} color="var(--brand-strong)" /> Top products
          </h2>
          {data.top_products.length === 0 ? (
            <p className="muted" style={{ fontSize: '.88rem' }}>No paid orders yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {data.top_products.map(p => (
                <div key={`${p.id}-${p.currency}`} className="card card--pad" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <a href={`${SITE_ORIGIN}/@${p.creator_handle}/${p.slug}`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, fontSize: '.92rem' }}>{p.title}</a>
                    <p className="muted" style={{ fontSize: '.8rem' }}>{p.creator_name} &middot; {p.order_count} order{p.order_count === 1 ? '' : 's'}</p>
                  </div>
                  <span className="mono" style={{ fontWeight: 700, flexShrink: 0 }}>{formatMoney(p.revenue_minor, p.currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 style={{ fontSize: '1.05rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FiShoppingBag size={16} color="var(--brand-strong)" /> Top creators
          </h2>
          {data.top_creators.length === 0 ? (
            <p className="muted" style={{ fontSize: '.88rem' }}>No paid orders yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {data.top_creators.map(c => (
                <div key={`${c.id}-${c.currency}`} className="card card--pad" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <a href={`${SITE_ORIGIN}/@${c.handle}`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, fontSize: '.92rem' }}>{c.name}</a>
                    <p className="muted" style={{ fontSize: '.8rem' }}>{c.email} &middot; {c.order_count} order{c.order_count === 1 ? '' : 's'}</p>
                  </div>
                  <span className="mono" style={{ fontWeight: 700, flexShrink: 0 }}>{formatMoney(c.revenue_minor, c.currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <h2 style={{ fontSize: '1.05rem', margin: '28px 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <FiUserPlus size={16} color="var(--brand-strong)" /> Recent signups
      </h2>
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Joined</th></tr>
          </thead>
          <tbody>
            {data.recent_signups.map(u => (
              <tr key={u.id}>
                <td data-label="Name">{u.name || u.username}</td>
                <td data-label="Email">{u.email || '—'}</td>
                <td data-label="Phone">{u.phone || '—'}</td>
                <td data-label="Role"><span className={`badge ${u.is_creator ? 'badge--highlight' : 'badge--neutral'}`}>{u.is_creator ? 'Creator' : 'Buyer'}</span></td>
                <td data-label="Joined" className="muted">{u.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
