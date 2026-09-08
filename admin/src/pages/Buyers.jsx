import { useEffect, useState } from 'react';
import { useAdmin } from '../context/AdminContext.jsx';
import { formatMoney } from '../lib/money';

export default function Buyers() {
  const { adminFetch } = useAdmin();
  const [buyers, setBuyers] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    adminFetch('/api/admin/buyers').then(setBuyers).catch(err => setError(err.message));
  }, [adminFetch]);

  if (error) return <p className="error-text">{error}</p>;
  if (!buyers) return <p className="muted">Loading...</p>;

  const filtered = q
    ? buyers.filter(b => [b.name, b.email, b.phone].filter(Boolean).some(v => v.toLowerCase().includes(q.toLowerCase())))
    : buyers;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <p className="muted" style={{ fontSize: '.88rem' }}>{buyers.length} buyer{buyers.length === 1 ? '' : 's'}</p>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email, phone..." style={{ maxWidth: 280 }} />
      </div>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Phone</th><th>Orders</th><th>Total spent</th><th>Joined</th></tr>
          </thead>
          <tbody>
            {filtered.map(b => (
              <tr key={b.id}>
                <td style={{ fontWeight: 600 }}>{b.name || '—'}</td>
                <td>{b.email}</td>
                <td>{b.phone || '—'}</td>
                <td>{b.order_count}</td>
                <td className="mono" style={{ fontWeight: 600 }}>{formatMoney(b.total_spent_minor, 'USD')}</td>
                <td className="muted">{b.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="muted" style={{ padding: 16, textAlign: 'center' }}>No buyers match.</p>}
      </div>
    </div>
  );
}
