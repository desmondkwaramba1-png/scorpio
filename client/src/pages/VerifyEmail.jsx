import { useEffect, useState } from 'react';
import { safeNext } from '../lib/safeNext';
import { AFTER_VERIFY_KEY } from './CheckEmail.jsx';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FiCheckCircle, FiXCircle } from 'react-icons/fi';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('checking'); // checking | verified | failed
  const [destination, setDestination] = useState('/');

  useEffect(() => {
    if (!token) { setStatus('failed'); return; }
    let cancelled = false;
    api.post('/api/auth/verify-email', { token })
      .then(async () => {
        if (cancelled) return;
        setStatus('verified');
        // Pull the now-verified session down, then take them straight in ,
        // a confirmed email means the ProtectedRoute email gate is cleared,
        // so there's nothing left to stop at. If the link was opened on a
        // device with no session, /dashboard bounces to /login on its own.
        const session = await refresh().catch(() => null);
        if (cancelled) return;
        // Back to what they were doing. A buyer must not land in seller setup.
        let saved = null;
        try { saved = safeNext(localStorage.getItem(AFTER_VERIFY_KEY)); localStorage.removeItem(AFTER_VERIFY_KEY); } catch { /* storage blocked */ }
        const target = !session?.user ? '/login' : saved || (session.creator ? '/dashboard' : '/');
        setDestination(target);
        setTimeout(() => navigate(target, { replace: true }), 1400);
      })
      .catch(() => { if (!cancelled) setStatus('failed'); });
    return () => { cancelled = true; };
  }, [token, refresh, navigate]);

  return (
    <AuthShell cardStyle={{ textAlign: 'center' }}>
      {status === 'checking' && <p className="muted">Verifying...</p>}
      {status === 'verified' && (
        <>
          <FiCheckCircle size={40} color="var(--success)" style={{ marginBottom: 14 }} />
          <h1 style={{ fontSize: '1.5rem', marginBottom: 10 }}>Email verified</h1>
          <p className="muted" style={{ marginBottom: 24 }}>Taking you back&hellip;</p>
          <Link to={destination} className="btn btn--primary">Go now</Link>
        </>
      )}
      {status === 'failed' && (
        <>
          <FiXCircle size={40} color="var(--red)" style={{ marginBottom: 14 }} />
          <h1 style={{ fontSize: '1.5rem', marginBottom: 10 }}>Link invalid or expired</h1>
          <p className="muted" style={{ marginBottom: 24 }}>Request a new verification email from your account settings.</p>
          <Link to="/login" className="btn btn--primary">Back to login</Link>
        </>
      )}
    </AuthShell>
  );
}
