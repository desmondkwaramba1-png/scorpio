import { useState } from 'react';
import { FiFlag, FiCheck } from 'react-icons/fi';
import { api } from '../lib/api';

// An order report opens the buyer/seller case chat and holds that order's
// proceeds. A product-only report goes to the admin review queue; selecting
// a serious claim reserves the product's unpaid proceeds until resolution.
export default function ReportProblem({ purchaseId, productId, hasOpenReport, stopPropagation, label, onReported, startOpen = false }) {
  const [reported, setReported] = useState(!!hasOpenReport);
  const [open, setOpen] = useState(startOpen);
  const [reason, setReason] = useState('');
  const [seriousClaim, setSeriousClaim] = useState(false);
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
        await api.post('/api/reports/product', { product_id: productId, reason: reason.trim(), serious_claim: seriousClaim });
      } else {
        await api.post(`/api/purchases/${purchaseId}/dispute`, { reason: reason.trim(), serious_claim: seriousClaim });
      }
      setReported(true);
      setOpen(false);
      onReported?.(reason.trim());
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
          placeholder={productId
            ? 'What is wrong with this listing? Be specific so SCORPIO can review it.'
            : 'What went wrong with this order? The other party can reply in the case chat.'}
          maxLength={2000}
        />
      </div>
      <label className="report-serious-claim">
        <input type="checkbox" checked={seriousClaim} onChange={e => setSeriousClaim(e.target.checked)} />
        <span>This alleges stolen, illegal, counterfeit, or fundamentally fake/misleading content. Unpaid proceeds from this product will be held while SCORPIO reviews it.</span>
      </label>
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
