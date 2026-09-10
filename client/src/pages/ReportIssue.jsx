import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiFlag } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api';

// The catch-all for a problem that isn't about a specific order or
// product — those have their own report paths (Account/Dashboard orders,
// and the product page itself; see ReportProblem.jsx). This one exists
// for "the checkout page is broken," "I can't log in," general feedback
// — and is deliberately reachable while logged out, since requiring
// login here would rule out reporting the exact class of problem
// ("I can't log in") it exists to catch.
export default function ReportIssue() {
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [reason, setReason] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/api/reports/general', { subject, reason, email });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="wrap" style={{ maxWidth: 420, padding: '56px 20px 80px', textAlign: 'center' }}>
        <FiFlag size={32} color="var(--green-glow)" style={{ marginBottom: 14 }} />
        <h1 style={{ fontSize: '1.4rem', marginBottom: 10 }}>Got it, thanks</h1>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          This goes straight to the SCORPIO team. We'll follow up{email || user ? ' by email' : ''} if we need more detail.
        </p>
      </div>
    );
  }

  return (
    <div className="wrap" style={{ maxWidth: 420, padding: '56px 20px 80px' }}>
      <h1 style={{ fontSize: '1.7rem', marginBottom: 10 }}>Report an issue</h1>
      <p className="muted" style={{ marginBottom: 28 }}>
        Found a bug, something broken, or just have feedback? Tell us — this isn't for a problem with a
        specific order (there's a "Report a problem" button right on the order for that).
      </p>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="subject">What's it about? (optional)</label>
          <input id="subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Checkout page won't load" />
        </div>
        <div className="field">
          <label htmlFor="reason">What happened?</label>
          <textarea
            id="reason" required rows={5} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="The more detail, the faster we can fix it — what page, what you did, what you expected instead."
          />
        </div>
        {!user && (
          <div className="field">
            <label htmlFor="email">Your email</label>
            <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            <small>So we can follow up if we need more detail.</small>
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
        <button className="btn btn--primary btn--block" disabled={submitting} type="submit">
          {submitting ? 'Sending...' : 'Send report'}
        </button>
        <p style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/" className="muted" style={{ fontSize: '.88rem', fontWeight: 600 }}>Back to SCORPIO</Link>
        </p>
      </form>
    </div>
  );
}
