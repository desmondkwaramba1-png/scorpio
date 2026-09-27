import { useEffect, useState } from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import { useAdmin } from '../context/AdminContext.jsx';
import { formatMoney } from '../lib/money';

function DisputeCard({ dispute, onResolve }) {
  const { adminPost } = useAdmin();
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(null);
  const [error, setError] = useState(null);

  async function resolve(resolution) {
    setSubmitting(resolution);
    setError(null);
    try {
      const data = await adminPost(`/api/admin/disputes/${dispute.dispute_id}/resolve`, { resolution, note });
      onResolve(dispute.dispute_id, data.note);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="card card--pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <p style={{ fontWeight: 700 }}>{dispute.product_title}</p>
          <p className="muted" style={{ fontSize: '.85rem' }}>
            {dispute.buyer_name || dispute.buyer_email} bought from {dispute.seller_name} ({dispute.seller_handle}) &middot; {formatMoney(dispute.amount_minor, dispute.currency)}
          </p>
          <p className="dispute-hold-summary">
            Order proceeds held: <strong>{formatMoney(dispute.order_funds_held_minor || 0, dispute.currency)}</strong>
            {dispute.product_funds_held_minor > 0 && <> &middot; Product reserve: <strong>{formatMoney(dispute.product_funds_held_minor, dispute.currency)}</strong></>}
          </p>
          {dispute.open_product_disputes > 1 && <p className="dispute-repeat-warning">{dispute.open_product_disputes} open disputes relate to this product.</p>}
        </div>
        <span className="muted" style={{ fontSize: '.8rem' }}>Disputed {dispute.disputed_at}</span>
      </div>

      <div className="card card--pad" style={{ background: 'var(--field-bg)', marginBottom: 10 }}>
        <p style={{ fontSize: '.82rem', fontWeight: 600, marginBottom: 4 }}>{dispute.opened_by_role === 'seller' ? "Seller's report" : "Buyer's report"}</p>
        <p style={{ fontSize: '.9rem', lineHeight: 1.5 }}>{dispute.reason}</p>
        {dispute.serious_claim === 1 && <span className="badge badge--red" style={{ display: 'inline-flex', marginTop: 8 }}>Serious product claim</span>}
      </div>

      {dispute.delivery ? (
        <div className="card card--pad" style={{ background: 'var(--field-bg)', marginBottom: 14 }}>
          <p style={{ fontSize: '.82rem', fontWeight: 600, marginBottom: 4 }}>What the seller says they delivered</p>
          <p style={{ fontSize: '.9rem', lineHeight: 1.5 }}>{dispute.delivery.message}</p>
          {dispute.delivery.external_url && <a href={dispute.delivery.external_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.85rem', fontWeight: 600 }}>Open link</a>}
        </div>
      ) : (
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: 14 }}>Seller never marked this delivered.</p>
      )}

      {dispute.timeline?.length > 0 && (
        <div className="card card--pad" style={{ background: 'var(--field-bg)', marginBottom: 14 }}>
          <p style={{ fontSize: '.82rem', fontWeight: 600, marginBottom: 6 }}>Case chat and evidence</p>
          {dispute.timeline.map(item => (
            <p key={`${item.type}-${item.id}`} style={{ fontSize: '.85rem', margin: '6px 0' }}>
              <strong>{item.author_role}:</strong>{' '}
              {item.type === 'message' ? item.body : <a href={item.storage_path} target="_blank" rel="noopener noreferrer">{item.original_filename}</a>}
            </p>
          ))}
        </div>
      )}

      <div className="field" style={{ marginBottom: 10 }}>
        <label htmlFor={`note-${dispute.dispute_id}`}>Resolution note (optional, kept on record)</label>
        <input id={`note-${dispute.dispute_id}`} value={note} onChange={e => setNote(e.target.value)} />
      </div>

      {error && <p className="error-text">{error}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn--sm" style={{ background: 'var(--red)', color: 'var(--ink-contrast)' }} onClick={() => resolve('refund')} disabled={!!submitting}>
          {submitting === 'refund' ? 'Saving...' : 'Refund buyer'}
        </button>
        <button className="btn btn--gold btn--sm" onClick={() => resolve('release')} disabled={!!submitting}>
          {submitting === 'release' ? 'Saving...' : 'Release to seller'}
        </button>
      </div>
    </div>
  );
}

export default function Disputes() {
  const { adminFetch } = useAdmin();
  const [disputes, setDisputes] = useState(null);
  const [error, setError] = useState(null);
  const [resolvedNote, setResolvedNote] = useState(null);

  useEffect(() => {
    adminFetch('/api/admin/disputes').then(setDisputes).catch(err => setError(err.message));
  }, [adminFetch]);

  function handleResolve(disputeId, note) {
    setDisputes(list => list.filter(d => d.dispute_id !== disputeId));
    setResolvedNote(note);
    setTimeout(() => setResolvedNote(null), 4000);
  }

  if (error) return <p className="error-text">{error}</p>;
  if (!disputes) return <p className="muted">Loading...</p>;

  return (
    <div>
      {resolvedNote && (
        <p className="card card--pad" style={{ color: 'var(--green-glow)', fontWeight: 600, marginBottom: 16 }}>{resolvedNote}</p>
      )}
      {disputes.length === 0 ? (
        <div className="empty-state"><FiAlertTriangle size={22} color="var(--muted)" style={{ marginBottom: 8 }} /><strong>No open disputes.</strong></div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {disputes.map(d => <DisputeCard key={d.dispute_id} dispute={d} onResolve={handleResolve} />)}
        </div>
      )}
    </div>
  );
}
