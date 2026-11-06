import { useEffect, useState } from 'react';
import { safeNext } from '../lib/safeNext';
import { Navigate, useSearchParams } from 'react-router-dom';
import { FiMail, FiRefreshCw } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api';
import AuthShell from '../components/AuthShell.jsx';

// The gate ProtectedRoute sends anyone with no email_verified_at to. Stays
// on this same page rather than bouncing them out of the app, they're
// still logged in, they just can't go further until they've confirmed the
// address is really theirs. Polls-by-hand (a "I've verified, continue"
// button) rather than actual polling, since the common case is: open the
// email in a new tab, click the link there, come back here and click once.
export const AFTER_VERIFY_KEY = 'scorpio_after_verify';

export default function CheckEmail() {
  const { user, loading, refresh } = useAuth();
  const [searchParams] = useSearchParams();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);
  const next = safeNext(searchParams.get('next'));

  // The verification link opens in a new tab with no memory of where this
  // person was headed, so the destination waits here for it.
  useEffect(() => {
    if (!next) return;
    try { localStorage.setItem(AFTER_VERIFY_KEY, next); } catch { /* storage blocked */ }
  }, [next]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.email_verified_at) return <Navigate to={next || '/'} replace />;

  async function resend() {
    setResending(true);
    setError(null);
    try {
      await api.post('/api/auth/resend-verification');
      setResent(true);
      setTimeout(() => setResent(false), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  async function checkNow() {
    setChecking(true);
    setError(null);
    try {
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <AuthShell cardStyle={{ textAlign: 'center' }}>
      <FiMail size={32} color="var(--accent-icon)" style={{ marginBottom: 14 }} />
      <h1 style={{ fontSize: '1.4rem', marginBottom: 10 }}>Verify your email</h1>
      <p className="muted" style={{ marginBottom: 28, lineHeight: 1.6 }}>
        We sent a link to <strong style={{ color: 'var(--ink)' }}>{user.email}</strong>. Open it, then come back
        here, the rest of SCORPIO unlocks once your email is confirmed.
      </p>

      <button className="btn btn--primary btn--block" onClick={checkNow} disabled={checking} style={{ marginBottom: 12 }}>
        <FiRefreshCw size={15} /> {checking ? 'Checking...' : "I've verified, continue"}
      </button>
      <button className="btn btn--ghost btn--block" onClick={resend} disabled={resending || resent}>
        {resent ? 'Sent, check your inbox' : resending ? 'Sending...' : 'Resend the email'}
      </button>

      <p className="muted" style={{ fontSize: '.82rem', marginTop: 18, lineHeight: 1.55 }}>
        Nothing yet? Check your spam or junk folder, and make sure <strong style={{ color: 'var(--ink)' }}>{user.email}</strong> is spelled correctly.
        It can take a minute or two to arrive.
      </p>

      {error && <p className="error-text" style={{ marginTop: 16 }}>{error}</p>}
    </AuthShell>
  );
}
