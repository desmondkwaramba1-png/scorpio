import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiMail } from 'react-icons/fi';
import { api } from '../lib/api';

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/api/auth/forgot-password', { identifier });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="wrap" style={{ maxWidth: 420, padding: '56px 20px 80px' }}>
        <h1 style={{ fontSize: '1.7rem', marginBottom: 14 }}>Check your email</h1>
        <p className="muted" style={{ marginBottom: 28, lineHeight: 1.6 }}>
          If that account exists, a reset link is on its way. Open it to set a new password.
        </p>
      </div>
    );
  }

  return (
    <div className="wrap" style={{ maxWidth: 420, padding: '56px 20px 80px' }}>
      <h1 style={{ fontSize: '1.7rem', marginBottom: 10 }}>Reset your password</h1>
      <p className="muted" style={{ marginBottom: 28 }}>Enter your username or email and we'll send a reset link.</p>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="identifier">Username or email</label>
          <input id="identifier" required value={identifier} onChange={e => setIdentifier(e.target.value)} />
        </div>

        {error && <p className="error-text">{error}</p>}
        <button className="btn btn--primary btn--block" disabled={submitting} type="submit">
          <FiMail size={15} /> {submitting ? 'Sending...' : 'Send reset link'}
        </button>
        <p style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/login" className="muted" style={{ fontSize: '.88rem', fontWeight: 600 }}>Back to login</Link>
        </p>
      </form>
    </div>
  );
}
