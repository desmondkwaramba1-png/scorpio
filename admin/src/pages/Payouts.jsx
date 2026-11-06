import { useEffect, useState } from 'react';
import { FiCheck, FiAlertTriangle, FiClock } from 'react-icons/fi';
import { useAdmin } from '../context/AdminContext.jsx';
import { formatMoney } from '../lib/money';

function MarkPaidRow({ creator, onPaid }) {
  const { adminPost } = useAdmin();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      await adminPost(`/api/admin/payouts/${creator.id}/mark-paid`, { amount_minor: creator.available_minor, currency: creator.currency });
      onPaid(creator.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card card--pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontWeight: 600 }}>{creator.name}</p>
        <p className="muted" style={{ fontSize: '.85rem' }}>
          {creator.payout_ecocash_number ? <span className="mono">{creator.payout_ecocash_number}</span> : creator.email}
        </p>
        {creator.payout_number_recently_changed && (
          <p style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--red)', marginTop: 4 }}>
            Payout number changed in the last 72 hours. Confirm with the seller by another channel before paying.
          </p>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span className="mono" style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--brand-strong)' }}>
          {formatMoney(creator.available_minor, creator.currency)}
        </span>
        {confirming ? (
          <>
            <button className="btn btn--ghost btn--sm" onClick={() => setConfirming(false)} disabled={submitting}>Cancel</button>
            <button className="btn btn--cta btn--sm" onClick={confirm} disabled={submitting}>
              {submitting ? 'Saving...' : `Confirm sent ${formatMoney(creator.available_minor, creator.currency)}`}
            </button>
          </>
        ) : (
          <button className="btn btn--primary btn--sm" onClick={() => setConfirming(true)}>
            <FiCheck size={14} /> Mark paid
          </button>
        )}
      </div>
      {error && <p className="error-text" style={{ width: '100%', fontSize: '.85rem' }}>{error}</p>}
    </div>
  );
}

export default function Payouts() {
  const { adminFetch } = useAdmin();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    adminFetch('/api/admin/payouts').then(setData).catch(err => setError(err.message));
  }

  useEffect(load, [adminFetch]);

  function handlePaid(creatorId) {
    // Optimistic-enough: just reload from the server so the numbers
    // (which now factor in the new payout row) are exactly right rather
    // than hand-adjusted client-side.
    load();
  }

  if (error) return <p className="error-text">{error}</p>;
  if (!data) return <p className="muted">Loading...</p>;

  return (
    <div>
      <div className="card card--pad" style={{ marginBottom: 24, borderTop: '3px solid var(--accent)' }}>
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: 4 }}>Total due this cycle</p>
        <div className="admin-payout-totals">
          {Object.entries(Object.keys(data.total_due_by_currency || {}).length ? data.total_due_by_currency : { USD: 0 }).map(([currency, amount]) => (
            <p key={currency} className="mono" style={{ fontWeight: 700, fontSize: '1.25rem' }}>{formatMoney(amount, currency)}</p>
          ))}
        </div>
      </div>

      {(Object.values(data.total_order_escrow_by_currency || {}).some(Boolean) || Object.values(data.total_product_hold_by_currency || {}).some(Boolean)) && (
        <div className="admin-fund-hold admin-fund-hold--summary">
          <div>
            <strong>Funds not available for payout</strong>
            <p>Open order disputes and serious product reviews remain held until an admin resolves them.</p>
          </div>
          <div className="admin-fund-hold__totals">
            {Object.entries(data.total_order_escrow_by_currency || {}).filter(([, amount]) => amount > 0).map(([currency, amount]) => <span key={`order-${currency}`}>Order holds <b>{formatMoney(amount, currency)}</b></span>)}
            {Object.entries(data.total_product_hold_by_currency || {}).filter(([, amount]) => amount > 0).map(([currency, amount]) => <span key={`product-${currency}`}>Product reserves <b>{formatMoney(amount, currency)}</b></span>)}
          </div>
        </div>
      )}

      {data.blocked.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: '1rem', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)' }}>
            <FiAlertTriangle size={16} /> Owed, but nowhere to send it
          </h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {data.blocked.map(c => (
              <div key={`${c.id}-${c.currency}`} className="card card--pad" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ fontWeight: 600 }}>{c.name}</p>
                  <p className="muted" style={{ fontSize: '.85rem' }}>{c.email} &middot; no EcoCash number on file</p>
                </div>
                <span className="mono" style={{ fontWeight: 700 }}>{formatMoney(c.available_minor, c.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 style={{ fontSize: '1rem', marginBottom: 10 }}>Ready to pay</h2>
      {data.ready.length === 0 ? (
        <p className="muted" style={{ fontSize: '.88rem' }}>Nothing owed right now.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {data.ready.map(c => <MarkPaidRow key={`${c.id}-${c.currency}`} creator={c} onPaid={handlePaid} />)}
        </div>
      )}
    </div>
  );
}
