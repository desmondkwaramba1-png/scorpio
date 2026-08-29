import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiMail, FiMessageCircle } from 'react-icons/fi';
import { api } from '../lib/api';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [method, setMethod] = useState('email');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/api/auth/forgot-password', { identifier, method });
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
        <h1 style={{ fontSize: '1.7rem', marginBottom: 14 }}>Check {method === 'email' ? 'your email' : 'WhatsApp'}</h1>
        <p className="muted" style={{ marginBottom: 28, lineHeight: 1.6 }}>
          {method === 'email'
            ? 'If that account exists, a reset link is on its way. Open it to set a new password.'
            : 'If that account exists, a reset code is on its way. Enter it on the next screen along with your new password.'}
        </p>
        {method === 'whatsapp' && (
          <button className="btn btn--primary btn--block" onClick={() => navigate('/reset-password')}>
            I have my code
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="wrap" style={{ maxWidth: 420, padding: '56px 20px 80px' }}>
      <h1 style={{ fontSize: '1.7rem', marginBottom: 10 }}>Reset your password</h1>
      <p className="muted" style={{ marginBottom: 28 }}>Enter your username or email, and how you'd like the reset code delivered.</p>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="identifier">Username or email</label>
          <input id="identifier" required value={identifier} onChange={e => setIdentifier(e.target.value)} />
        </div>

        <div className="field">
          <label>Send my reset code by</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className={`method-btn${method === 'email' ? ' method-btn--active' : ''}`} onClick={() => setMethod('email')}>
              <FiMail /> Email
            </button>
            <button type="button" className={`method-btn${method === 'whatsapp' ? ' method-btn--active' : ''}`} onClick={() => setMethod('whatsapp')}>
              <FiMessageCircle /> WhatsApp
            </button>
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}
        <button className="btn btn--primary btn--block" disabled={submitting} type="submit">
          {submitting ? 'Sending...' : 'Send reset code'}
        </button>
        <p style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/login" className="muted" style={{ fontSize: '.88rem', fontWeight: 600 }}>Back to login</Link>
        </p>
      </form>
    </div>
  );
}
