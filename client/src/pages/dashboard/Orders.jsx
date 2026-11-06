import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiTrendingUp, FiShield, FiAlertTriangle } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/money';
import ReportProblem from '../../components/ReportProblem.jsx';
import DisputeThread from '../../components/DisputeThread.jsx';

function formatDate(sqliteDatetime) {
  const d = new Date(sqliteDatetime.replace(' ', 'T'));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const FULFILLMENT_LABEL = {
  awaiting_delivery: { text: 'Awaiting delivery', className: 'badge--highlight' },
  delivered: { text: 'Delivered, awaiting buyer', className: 'badge--highlight' },
  released: { text: 'Released to you', className: 'badge--success' },
  disputed: { text: 'Disputed', className: 'badge--neutral' },
  refunded: { text: 'Refunded to buyer', className: 'badge--neutral' }
};

function DeliverForm({ purchaseId, onDelivered }) {
  const [message, setMessage] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const body = new FormData();
    body.append('message', message);
    if (externalUrl) body.append('external_url', externalUrl);
    if (file) body.append('file', file);
    try {
      await api.post(`/api/purchases/${purchaseId}/deliver`, body);
      onDelivered();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
      <div className="field" style={{ marginBottom: 10 }}>
        <label htmlFor={`deliver-msg-${purchaseId}`}>What did you deliver?</label>
        <textarea id={`deliver-msg-${purchaseId}`} required value={message} onChange={e => setMessage(e.target.value)}
          placeholder="Final logo files, 3 concepts as discussed" style={{ minHeight: 70 }} />
      </div>
      <div className="field" style={{ marginBottom: 10 }}>
        <label htmlFor={`deliver-url-${purchaseId}`}>Link (optional)</label>
        <input id={`deliver-url-${purchaseId}`} value={externalUrl} onChange={e => setExternalUrl(e.target.value)} placeholder="https://drive.google.com/..." />
      </div>
      <div className="field" style={{ marginBottom: 10 }}>
        <label htmlFor={`deliver-file-${purchaseId}`}>File (optional)</label>
        <input id={`deliver-file-${purchaseId}`} type="file" onChange={e => setFile(e.target.files[0] || null)} />
      </div>
      {error && <p className="error-text" style={{ marginBottom: 10 }}>{error}</p>}
      <button className="btn btn--cta btn--sm" disabled={submitting} type="submit">
        {submitting ? 'Marking delivered...' : 'Mark delivered'}
      </button>
    </form>
  );
}

// fulfillment_status reads straight from o (the parent's real data, kept
// current via onUpdate below), not a local copy — Account.jsx's
// ServiceStatus had exactly this bug the other way around: a local
// useState that updated the row correctly but never told the page's own
// order list, so an aggregate count elsewhere kept counting an order
// that had actually just been resolved. onUpdate is what closes that
// loop here before it repeats.
function OrderRow({ o, creator, currentUserId, onUpdate }) {
  const [delivering, setDelivering] = useState(false);
  const fulfillment = o.fulfillment_status;
  const label = fulfillment ? FULFILLMENT_LABEL[fulfillment] : null;

  return (
    <div className="card card--pad order-card">
      <div className="order-card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {o.buyer_name || 'Buyer'}
          </p>
          <p className="muted" style={{ fontSize: '.85rem' }}>
            Bought <Link to={`/@${creator.handle}/${o.product_slug}`}>{o.product_title}</Link> &middot; {formatDate(o.created_at)}
          </p>
        </div>
        <div className="order-card__meta" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '100%' }}>
          {label && <span className={`badge ${label.className}`}>{label.text}</span>}
          <span className="mono" style={{ fontWeight: 600, fontSize: '.9rem' }}>{formatMoney(o.amount_minor, o.currency)}</span>
          {fulfillment === 'awaiting_delivery' && (
            <button className="btn btn--cta btn--sm" onClick={() => setDelivering(d => !d)}>
              {delivering ? 'Cancel' : 'Mark delivered'}
            </button>
          )}
        </div>
      </div>

      {fulfillment === 'disputed' && (
        <>
          <p className="muted" style={{ fontSize: '.82rem', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <FiAlertTriangle size={13} color="var(--red)" /> The buyer reported a problem with this order. It's being reviewed.
          </p>
          <DisputeThread purchaseId={o.id} currentUserId={currentUserId}
            disputeStatus={o.dispute_status || 'open'} disputeReason={o.dispute_reason || ''} />
        </>
      )}

      {delivering && fulfillment === 'awaiting_delivery' && (
        <DeliverForm purchaseId={o.id} onDelivered={() => { onUpdate(o.id, { fulfillment_status: 'delivered' }); setDelivering(false); }} />
      )}

        {/* Only paid orders that have not already entered a case can start a
          buyer/seller dispute from here. */}
      {fulfillment !== 'disputed' && (!fulfillment || ['awaiting_delivery', 'delivered'].includes(fulfillment)) && (
        <div style={{ marginTop: 10 }}>
          <ReportProblem
            purchaseId={o.id}
            hasOpenReport={o.has_open_report}
            label="Open order case"
            onReported={reason => onUpdate(o.id, { fulfillment_status: 'disputed', dispute_status: 'open', dispute_reason: reason })}
          />
        </div>
      )}
    </div>
  );
}

export default function Orders() {
  const { creator, user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/insights/orders').then(setData).catch(err => setError(err.message));
  }, []);

  function handleOrderUpdate(purchaseId, patch) {
    setData(d => ({ ...d, orders: d.orders.map(o => o.id === purchaseId ? { ...o, ...patch } : o) }));
  }

  if (error) return <p className="error-text">{error}</p>;

  if (!data) {
    return (
      <div>
        <h1 style={{ fontSize: '1.5rem', marginBottom: 24 }}>Orders</h1>
        <div className="skeleton" style={{ height: 80, borderRadius: 'var(--radius)', marginBottom: 24 }} />
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 'var(--radius)' }} />)}
        </div>
      </div>
    );
  }

  const awaitingDelivery = data.orders.filter(o => o.fulfillment_status === 'awaiting_delivery').length;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: 6 }}>Orders</h1>
      <p className="muted" style={{ fontSize: '.88rem', marginBottom: 24 }}>
        Everyone who's bought from you, with a way to reach them when you launch something new.
      </p>

      {awaitingDelivery > 0 && (
        <div className="trust-line" style={{ marginBottom: 24 }}>
          <FiShield size={16} />
          <span>
            {awaitingDelivery} service order{awaitingDelivery === 1 ? '' : 's'} waiting on you to deliver.
            That money is held safely until you mark it delivered and the buyer confirms (or 5 days pass).
          </span>
        </div>
      )}

      <div className="card card--pad" style={{ marginBottom: 24 }}>
        <p style={{ fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
          <FiTrendingUp size={15} color="var(--brand-strong)" /> Running fast this week
        </p>
        {data.trending.length === 0 && <p className="muted" style={{ fontSize: '.9rem' }}>No orders in the last 7 days yet.</p>}
        {data.trending.length > 0 && (
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {data.trending.map(p => (
              <Link key={p.id} to={`/@${creator.handle}/${p.slug}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.92rem' }}>
                <span>{p.title}</span>
                <span className="mono muted">{p.order_count} order{p.order_count === 1 ? '' : 's'} this week</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {data.orders.length === 0 ? (
        <div className="empty-state">
          <strong>No paid orders yet.</strong>
          Your buyers will show up here once your first order comes in.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {data.orders.map(o => <OrderRow key={o.id} o={o} creator={creator} currentUserId={user?.id} onUpdate={handleOrderUpdate} />)}
        </div>
      )}
    </div>
  );
}
