import { useEffect, useState } from 'react';
import { FiMessageSquare } from 'react-icons/fi';
import { useAdmin } from '../context/AdminContext.jsx';
import { formatMoney } from '../lib/money';

// Separate queue from Disputes.jsx — that one only ever covered 'service'
// orders (held payment, refund/release resolution). This covers every
// ordinary digital-goods order, which had no reporting path at all before
// (see migrations/027_reports.sql). No money moves here — resolving just
// records that a human looked at it.
function ReportCard({ report, onResolve }) {
  const { adminPost } = useAdmin();
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function resolve() {
    setSubmitting(true);
    setError(null);
    try {
      await adminPost(`/api/admin/reports/${report.report_id}/resolve`, { note });
      onResolve(report.report_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card card--pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <p style={{ fontWeight: 700 }}>{report.product_title}</p>
          <p className="muted" style={{ fontSize: '.85rem' }}>
            {report.buyer_name || report.buyer_email} bought from {report.seller_name} ({report.seller_handle}) &middot; {formatMoney(report.amount_minor, report.currency)}
          </p>
        </div>
        <span className="muted" style={{ fontSize: '.8rem' }}>Reported {report.reported_at}</span>
      </div>

      <div className="card card--pad" style={{ background: 'var(--field-bg)', marginBottom: 14 }}>
        <p style={{ fontSize: '.82rem', fontWeight: 600, marginBottom: 4 }}>
          Reported by the {report.reporter_role} ({report.reporter_email})
        </p>
        <p style={{ fontSize: '.9rem', lineHeight: 1.5 }}>{report.reason}</p>
      </div>

      <div className="field" style={{ marginBottom: 10 }}>
        <label htmlFor={`note-${report.report_id}`}>Note (optional, kept on record)</label>
        <input id={`note-${report.report_id}`} value={note} onChange={e => setNote(e.target.value)} />
      </div>

      {error && <p className="error-text">{error}</p>}
      <button className="btn btn--gold btn--sm" onClick={resolve} disabled={submitting}>
        {submitting ? 'Saving...' : 'Mark resolved'}
      </button>
    </div>
  );
}

export default function Reports() {
  const { adminFetch } = useAdmin();
  const [reports, setReports] = useState(null);
  const [error, setError] = useState(null);
  const [resolvedFlash, setResolvedFlash] = useState(false);

  useEffect(() => {
    adminFetch('/api/admin/reports').then(setReports).catch(err => setError(err.message));
  }, [adminFetch]);

  function handleResolve(reportId) {
    setReports(list => list.filter(r => r.report_id !== reportId));
    setResolvedFlash(true);
    setTimeout(() => setResolvedFlash(false), 4000);
  }

  if (error) return <p className="error-text">{error}</p>;
  if (!reports) return <p className="muted">Loading...</p>;

  return (
    <div>
      {resolvedFlash && (
        <p className="card card--pad" style={{ color: 'var(--green-glow)', fontWeight: 600, marginBottom: 16 }}>Marked resolved.</p>
      )}
      {reports.length === 0 ? (
        <div className="empty-state"><FiMessageSquare size={22} color="var(--muted)" style={{ marginBottom: 8 }} /><strong>No open reports.</strong></div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {reports.map(r => <ReportCard key={r.report_id} report={r} onResolve={handleResolve} />)}
        </div>
      )}
    </div>
  );
}
