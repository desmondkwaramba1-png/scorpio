import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api';
import Terms from './Terms.jsx';

export default function AcceptTerms() {
  const { user, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.terms_accepted_at) return <Navigate to="/dashboard" replace />;

  async function accept() {
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/auth/accept-terms');
      const data = await refresh();
      // Role (creator vs buyer) isn't known here — it only travels through the
      // OAuth redirect's query param, which this gate sits behind. Land
      // creators in their dashboard; everyone else goes to Account, which
      // itself offers a "start selling" path rather than assuming intent.
      navigate(data.creator ? '/dashboard' : '/account', { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="wrap" style={{ paddingTop: 32 }}>
        <div className="card card--pad" style={{ background: 'var(--gold-tint)', borderColor: 'var(--gold)' }}>
          <p style={{ fontWeight: 700, marginBottom: 6 }}>One more thing before you continue</p>
          <p className="muted" style={{ fontSize: '.92rem', marginBottom: 16 }}>
            Read the platform terms below, then confirm you agree.
          </p>
          <button className="btn btn--primary" onClick={accept} disabled={submitting}>
            {submitting ? 'Saving...' : 'I agree, continue'}
          </button>
          {error && <p className="error-text">{error}</p>}
        </div>
      </div>
      <Terms />
    </div>
  );
}
