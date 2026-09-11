import { useState } from 'react';
import { FiFlag, FiCheck } from 'react-icons/fi';
import { api } from '../lib/api';

// Buyer or seller flagging a problem, either about a specific order
// (purchaseId, the original case: see migrations/027_reports.sql) or
// about a product with no order behind it at all (productId, a seller
// flagging another seller's listing as a copy, added in 028; see
// routes/reports.js's POST /product). Exactly one of purchaseId/productId
// is expected. Deliberately plain: no escrow, no resolution flow in the
// UI, this just gets a human (the platform operator) looking at it, same
// honesty as the wallet payout stub elsewhere in the app.
export default function ReportProblem({ purchaseId, productId, hasOpenReport, stopPropagation, label }) {
  const [reported, setReported] = useState(!!hasOpenReport);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function stop(e) {
    if (stopPropagation) e.stopPropagation();
  }

  async function submit(e) {
    e.preventDefault();
    stop(e);
    if (!reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      if (productId) {
        await api.post('/api/reports/product', { product_id: productId, reason: reason.trim() });
      } else {
        await api.post('/api/reports', { purchase_id: purchaseId, reason: reason.trim() });
      }
      setReported(true);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (reported) {
    return (
      <span className="badge badge--neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <FiFlag size={11} /> Reported
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={e => { stop(e); setOpen(true); }}
      >
        <FiFlag size={13} /> {label || 'Report a problem'}
      </button>
    );
  }

  return (
    <form onSubmit={submit} onClick={stop} style={{ marginTop: 12, width: '100%' }}>
      <div className="field" style={{ marginBottom: 8 }}>
        <textarea
          autoFocus rows={3} value={reason} onChange={e => setReason(e.target.value)}
          placeholder="What went wrong? Be specific, this goes straight to the platform operator."
          maxLength={2000}
        />
      </div>
      {error && <p className="error-text" style={{ marginBottom: 8 }}>{error}</p>}
      <div className="btn-row">
        <button type="submit" className="btn btn--primary btn--sm" disabled={submitting || !reason.trim()}>
          {submitting ? 'Sending...' : <><FiCheck size={13} /> Send report</>}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={e => { stop(e); setOpen(false); }}>
          Cancel
        </button>
      </div>
    </form>
  );
}
