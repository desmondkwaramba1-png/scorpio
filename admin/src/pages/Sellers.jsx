import { useEffect, useState } from 'react';
import { useAdmin } from '../context/AdminContext.jsx';
import { formatMoney } from '../lib/money';
import { SITE_ORIGIN } from '../lib/site';

export default function Sellers() {
  const { adminFetch } = useAdmin();
  const [sellers, setSellers] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    adminFetch('/api/admin/sellers').then(setSellers).catch(err => setError(err.message));
  }, [adminFetch]);

  if (error) return <p className="error-text">{error}</p>;
  if (!sellers) return <p className="muted">Loading...</p>;

  const filtered = q
    ? sellers.filter(s => [s.name, s.handle, s.email, s.phone].filter(Boolean).some(v => v.toLowerCase().includes(q.toLowerCase())))
    : sellers;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <p className="muted" style={{ fontSize: '.88rem' }}>{sellers.length} creator{sellers.length === 1 ? '' : 's'}</p>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, handle, email, phone..." style={{ maxWidth: 280 }} />
      </div>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Creator</th><th>Email</th><th>Phone</th><th>Products</th>
              <th>Available</th><th>Held (escrow)</th><th>Payout number</th><th>Verified</th><th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id}>
                <td data-label="Creator"><a href={`${SITE_ORIGIN}/@${s.handle}`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>{s.name}</a></td>
                <td data-label="Email">{s.email}</td>
                <td data-label="Phone">{s.phone || '—'}</td>
                <td data-label="Products">{s.published_count} / {s.product_count}</td>
                <td data-label="Available" className="mono" style={{ color: 'var(--green-glow)', fontWeight: 600 }}>{formatMoney(s.available_minor, 'USD')}</td>
                <td data-label="Held (escrow)" className="mono muted">{formatMoney(s.escrowed_minor, 'USD')}</td>
                <td data-label="Payout number">{s.payout_ecocash_number
                  ? <span className="mono">{s.payout_ecocash_number}</span>
                  : <span className="badge badge--neutral">None on file</span>}
                </td>
                <td data-label="Verified">{s.verified ? <span className="badge badge--green">Verified</span> : <span className="badge badge--neutral">Not yet</span>}</td>
                <td data-label="Joined" className="muted">{s.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="muted" style={{ padding: 16, textAlign: 'center' }}>No creators match.</p>}
      </div>
    </div>
  );
}
