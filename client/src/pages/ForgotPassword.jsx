import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiMail } from 'react-icons/fi';
import { api } from '../lib/api';

const CAP_SHIELD_SITE_KEY = 'ca7656de201ab286ce18';

function useCapShieldWidget() {
  useEffect(() => {
    if (document.querySelector('script[data-capshield-widget]')) return;
    const script = document.createElement('script');
    script.src = 'https://capshield.vercel.app/widget.js';
    script.async = true;
    script.dataset.capshieldWidget = 'true';
    document.head.appendChild(script);
  }, []);
}
import AuthShell from '../components/AuthShell.jsx';

export default function ForgotPassword() {
  useCapShieldWidget();
  const [identifier, setIdentifier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const capToken = document.querySelector('input[name="cap-token"]')?.value;
      if (!capToken) { setError('Complete the security check before continuing.'); return; }
      await api.post('/api/auth/forgot-password', { identifier, 'cap-token': capToken });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthShell>
        <h1 style={{ fontSize: '1.7rem', marginBottom: 14 }}>Check your email</h1>
        <p className="muted" style={{ marginBottom: 4, lineHeight: 1.6 }}>
          If that account exists, a reset link is on its way. Open it to set a new password.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 style={{ fontSize: '1.7rem', marginBottom: 10 }}>Reset your password</h1>
      <p className="muted" style={{ marginBottom: 28 }}>Enter your username or email and we'll send a reset link.</p>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="identifier">Username or email</label>
          <input id="identifier" required value={identifier} onChange={e => setIdentifier(e.target.value)} autoFocus />
        </div>

        <div style={{ margin: '8px 0 18px' }}><cap-widget data-cap-api-endpoint={`https://capshield.vercel.app/v1/${CAP_SHIELD_SITE_KEY}/`}></cap-widget></div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn--primary btn--block" disabled={submitting} type="submit">
          <FiMail size={15} /> {submitting ? 'Sending...' : 'Send reset link'}
        </button>
        <p style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/login" className="muted" style={{ fontSize: '.88rem', fontWeight: 600 }}>Back to login</Link>
        </p>
      </form>
    </AuthShell>
  );
}
