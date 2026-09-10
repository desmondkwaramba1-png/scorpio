import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiCheck } from 'react-icons/fi';
import Seal from './Seal.jsx';
import { api } from '../lib/api';

const CRITERIA = [
  { key: 'email_verified', label: 'Verify your email' },
  { key: 'payout_added', label: 'Add an EcoCash payout number' },
  { key: 'has_published_product', label: 'Publish a product' },
  { key: 'has_paid_sale', label: 'Get your first paid order' }
];

export default function VerificationChecklist() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    setError(null);
    api.get('/api/creators/me/verification-status').then(setStatus).catch(err => setError(err.message));
  }

  useEffect(load, []);

  if (error) {
    return (
      <div className="card card--pad" style={{ marginBottom: 20 }}>
        <p className="error-text" style={{ marginBottom: 8 }}>Couldn't load your verification status: {error}</p>
        <button className="btn btn--ghost btn--sm" onClick={load}>Retry</button>
      </div>
    );
  }

  if (!status) return null;

  if (status.verified) {
    return (
      <div className="card card--pad" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Seal />
        <div>
          <p style={{ fontWeight: 600 }}>You're verified</p>
          <p className="muted" style={{ fontSize: '.85rem' }}>
            Earned automatically {status.verified_at ? `on ${new Date(status.verified_at.replace(' ', 'T') + 'Z').toLocaleDateString()}` : ''}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card card--pad" style={{ marginBottom: 20 }}>
      <p style={{ fontWeight: 600, marginBottom: 4 }}>Get verified</p>
      <p className="muted" style={{ fontSize: '.88rem', marginBottom: 8 }}>
        The Seal is granted automatically, no review queue. Complete these:
      </p>
      <div>
        {CRITERIA.map(c => (
          <div key={c.key} className={`checklist-item${status.criteria[c.key] ? ' checklist-item--done' : ''}`}>
            <span className="checklist-item__icon">{status.criteria[c.key] && <FiCheck size={12} />}</span>
            {c.key === 'email_verified' && !status.criteria[c.key] ? (
              <Link to="/check-email" style={{ color: 'var(--green-glow)', fontWeight: 600, textDecoration: 'underline' }}>{c.label}</Link>
            ) : (
              <span>{c.label}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
