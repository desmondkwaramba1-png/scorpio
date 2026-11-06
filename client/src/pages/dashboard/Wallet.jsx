import { useEffect, useState } from 'react';
import { FiDollarSign, FiMinusCircle, FiCreditCard, FiClock, FiCalendar, FiAlertTriangle } from 'react-icons/fi';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { formatDate } from '../../lib/time';

// What this sale means for the seller's money right now.
function saleStatus(t) {
  if (t.fulfillment_status === 'refunded') return { label: 'Refunded', tone: 'badge--neutral' };
  if (t.fulfillment_status === 'disputed') return { label: 'In dispute', tone: 'badge--warning' };
  if (t.fulfillment_status === 'released' || !t.fulfillment_status) return { label: 'Available', tone: 'badge--success' };
  if (t.fulfillment_status === 'awaiting_delivery') return { label: 'Deliver to release', tone: 'badge--warning' };
  return { label: 'On 5-day hold', tone: 'badge--neutral' };
}

export default function Wallet() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/wallet/me').then(setData).catch(err => setError(err.message));
  }, []);

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

      {Object.values(data.balances_by_currency || { USD: data }).map(balance => (
        <section key={balance.currency} className="wallet-currency-section">
          <h2>{balance.currency} balance</h2>
          <div className="stat-grid">
            <div className="card stat-tile"><span className="stat-tile__label"><FiDollarSign size={13} /> Gross</span><span className="mono stat-tile__value">{formatMoney(balance.gross_minor, balance.currency)}</span></div>
            <div className="card stat-tile"><span className="stat-tile__label"><FiMinusCircle size={13} /> Fee</span><span className="mono stat-tile__value">{formatMoney(balance.fee_minor, balance.currency)}</span></div>
            <div className="card stat-tile"><span className="stat-tile__label"><FiCreditCard size={13} /> Available</span><span className="mono stat-tile__value" style={{ color: 'var(--success)' }}>{formatMoney(balance.available_minor, balance.currency)}</span></div>
            <div className="card stat-tile"><span className="stat-tile__label"><FiClock size={13} /> Order holds</span><span className="mono stat-tile__value">{formatMoney(balance.escrowed_minor, balance.currency)}</span></div>
            {balance.product_hold_minor > 0 && <div className="card stat-tile"><span className="stat-tile__label"><FiAlertTriangle size={13} /> Product review hold</span><span className="mono stat-tile__value">{formatMoney(balance.product_hold_minor, balance.currency)}</span></div>}
          </div>

          {balance.product_holds?.length > 0 && (
            <div className="wallet-product-holds">
              <p className="wallet-product-holds__title">Held during product review</p>
              {balance.product_holds.map(hold => <div key={hold.product_id} className="wallet-product-holds__row"><span>{hold.product_title}</span><strong>{formatMoney(hold.amount_minor, hold.currency)}</strong></div>)}
              <p className="wallet-product-holds__note">These unpaid proceeds remain unavailable until SCORPIO resolves the serious product report.</p>
            </div>
          )}
        </section>
      ))}

      <p className="muted" style={{ fontSize: '.85rem', marginBottom: 24 }}>
        Sales become available 5 days after delivery, once the buyer protection window ends. Fee: {data.fee_policy}.
      </p>

      <div className="card card--pad" style={{ marginBottom: 28, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--accent-tint)', color: 'var(--accent-ink)'
        }}>
          <FiCalendar size={17} />
        </span>
        <div>
          <p style={{ fontWeight: 600, marginBottom: 2 }}>Paid out every Friday</p>
          <p className="muted" style={{ fontSize: '.88rem' }}>
            {data.payout_number
              ? `Your available balance settles to ${data.payout_number} weekly.`
              : 'Add an EcoCash number in Settings so we know where to send it.'}
          </p>
        </div>
      </div>

      <p style={{ fontWeight: 600, marginBottom: 16 }}>Transactions</p>
      {data.transactions.length === 0 && (
        <div className="empty-state"><strong>No transactions yet.</strong></div>
      )}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {data.transactions.map(t => (
          <div key={t.id} className="card card--pad" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: '.92rem' }}>{t.product_title}</p>
              <p className="muted" style={{ fontSize: '.82rem' }}>{t.buyer_name || 'A buyer'} &middot; {formatDate(t.created_at)}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p className="mono" style={{ fontWeight: 600 }}>{formatMoney(t.amount_minor, t.currency)}</p>
              <span className={`badge ${saleStatus(t).tone}`}>{saleStatus(t).label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
