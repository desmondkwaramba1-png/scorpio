import { useEffect, useState } from 'react';
import { FiDollarSign, FiMinusCircle, FiCreditCard, FiClock } from 'react-icons/fi';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/money';

export default function Wallet() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    load();
  }, []);

  function load() {
    api.get('/api/wallet/me').then(setData).catch(err => setError(err.message));
  }

  async function withdraw() {
    setNotice(null);
    try {
      await api.post('/api/wallet/withdraw');
    } catch (err) {
      setNotice(err.message);
    }
  }

  if (error) return <p className="error-text">{error}</p>;

  if (!data) {
    return (
      <div>
        <h1 style={{ fontSize: '1.5rem', marginBottom: 24 }}>Wallet</h1>
        <div className="stat-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card stat-tile">
              <div className="skeleton" style={{ height: 12, width: '60%' }} />
            </div>
          ))}
        </div>
        <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius)' }} />
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: 24 }}>Wallet</h1>

      <div className="stat-grid">
        <div className="card stat-tile">
          <span className="stat-tile__label"><FiDollarSign size={13} /> Gross</span>
          <span className="mono stat-tile__value">{formatMoney(data.gross_minor, data.currency)}</span>
        </div>
        <div className="card stat-tile">
          <span className="stat-tile__label"><FiMinusCircle size={13} /> Fee</span>
          <span className="mono stat-tile__value">{formatMoney(data.fee_minor, data.currency)}</span>
        </div>
        <div className="card stat-tile">
          <span className="stat-tile__label"><FiCreditCard size={13} /> Available</span>
          <span className="mono stat-tile__value" style={{ color: 'var(--green-glow)' }}>{formatMoney(data.available_minor, data.currency)}</span>
        </div>
        <div className="card stat-tile">
          <span className="stat-tile__label"><FiClock size={13} /> Pending (5-day hold)</span>
          <span className="mono stat-tile__value">{formatMoney(data.escrowed_minor, data.currency)}</span>
        </div>
      </div>

      <p className="muted" style={{ fontSize: '.85rem', marginBottom: 24 }}>Fee policy: {data.fee_policy}.</p>

      <div className="card card--pad" style={{ marginBottom: 28 }}>
        <p style={{ fontWeight: 600, marginBottom: 6 }}>Request a withdrawal</p>
        <p className="muted" style={{ fontSize: '.9rem', marginBottom: 14 }}>
          {data.payout_number
            ? `Sent to your EcoCash number on file (${data.payout_number}).`
            : 'Add an EcoCash number in Settings first.'}
        </p>
        <button className="btn btn--gold btn--sm" onClick={withdraw}>Request withdrawal</button>
        <p className="muted" style={{ fontSize: '.78rem', marginTop: 10 }}>
          Your available balance settles to your EcoCash number every Friday. On-demand withdrawal isn't
          automated yet, so this button won't move money instantly, but you're still paid out weekly.
        </p>
        {notice && <p className="error-text" style={{ fontSize: '.85rem', marginTop: 10 }}>{notice}</p>}
      </div>

      <p style={{ fontWeight: 600, marginBottom: 16 }}>Transactions</p>
      {data.transactions.length === 0 && (
        <div className="empty-state"><strong>No transactions yet.</strong></div>
      )}
      <div style={{ display: 'grid', gap: 10 }}>
        {data.transactions.map(t => (
          <div key={t.id} className="card card--pad" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: '.92rem' }}>{t.product_title}</p>
              <p className="muted" style={{ fontSize: '.82rem' }}>{t.buyer_name || t.buyer_email} &middot; {t.created_at}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p className="mono" style={{ fontWeight: 600 }}>{formatMoney(t.amount_minor, t.currency)}</p>
              <span className={`badge ${t.payment_status === 'paid' ? 'badge--green' : 'badge--neutral'}`}>{t.payment_status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
