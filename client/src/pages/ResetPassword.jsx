import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api';

// Only reachable via the emailed reset link's ?token= — the WhatsApp-coded
// fallback path this used to support was removed along with the rest of
// the WhatsApp notification stub (see notify.js), since it never actually
// sent anything.
export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/auth/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="wrap" style={{ maxWidth: 420, padding: '56px 20px 80px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: 10 }}>This link is missing its token</h1>
        <p className="muted" style={{ marginBottom: 24 }}>Use the reset link from your email, or request a new one.</p>
        <Link to="/forgot-password" className="btn btn--primary">Request a new link</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="wrap" style={{ maxWidth: 420, padding: '56px 20px 80px' }}>
        <h1 style={{ fontSize: '1.7rem', marginBottom: 14 }}>Password updated</h1>
        <p className="muted" style={{ marginBottom: 28 }}>You can log in with your new password now.</p>
        <button className="btn btn--primary" onClick={() => navigate('/login')}>Go to login</button>
      </div>
    );
  }

  return (
    <div className="wrap" style={{ maxWidth: 420, padding: '56px 20px 80px' }}>
      <h1 style={{ fontSize: '1.7rem', marginBottom: 10 }}>Set a new password</h1>
      <p className="muted" style={{ marginBottom: 28 }}>You followed a reset link. Choose a new password.</p>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="password">New password</label>
          <input id="password" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirm new password</label>
          <input id="confirm" type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn--primary btn--block" disabled={submitting} type="submit">
          {submitting ? 'Saving...' : 'Set new password'}
        </button>
        <p style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/login" className="muted" style={{ fontSize: '.88rem', fontWeight: 600 }}>Back to login</Link>
        </p>
      </form>
    </div>
  );
}
