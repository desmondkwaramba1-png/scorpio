import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FiCheckCircle, FiXCircle } from 'react-icons/fi';
import { api } from '../lib/api';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('checking'); // checking | verified | failed

  useEffect(() => {
    if (!token) { setStatus('failed'); return; }
    api.post('/api/auth/verify-email', { token })
      .then(() => setStatus('verified'))
      .catch(() => setStatus('failed'));
  }, [token]);

  return (
    <div className="wrap" style={{ maxWidth: 420, padding: '80px 20px', textAlign: 'center' }}>
      {status === 'checking' && <p className="muted">Verifying...</p>}
      {status === 'verified' && (
        <>
          <FiCheckCircle size={40} color="var(--green)" style={{ marginBottom: 14 }} />
          <h1 style={{ fontSize: '1.5rem', marginBottom: 10 }}>Email verified</h1>
          <p className="muted" style={{ marginBottom: 24 }}>Your account is confirmed.</p>
          <Link to="/dashboard" className="btn btn--primary">Go to dashboard</Link>
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
    </div>
  );
}
