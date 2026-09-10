import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="wrap" style={{ padding: '80px 20px' }}><p style={{ color: 'var(--muted)' }}>Loading...</p></div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!user.terms_accepted_at && location.pathname !== '/accept-terms') {
    return <Navigate to="/accept-terms" replace />;
  }
  // Re-enabled: Resend's sending domain (scorpio.co.zw) is now verified —
  // confirmed for real, not just by the dashboard's status label. A test
  // send to a fake address came back with an actual SMTP bounce straight
  // from Gmail ("no such user"), proof mail is genuinely reaching real
  // providers now, not silently failing the way it was when this block
  // was disabled (see git history on this file for that incident).
  //
  // Checked after terms, not before — a brand-new signup should agree to
  // terms first, then verify. Google/Facebook accounts skip this gate
  // entirely: findOrCreateUser (oauth.js) already sets email_verified_at
  // immediately when the provider itself reports the email as verified,
  // which is the normal case for those, so there's nothing to re-confirm.
  if (!user.email_verified_at && location.pathname !== '/check-email') {
    return <Navigate to="/check-email" replace />;
  }
  return children;
}
