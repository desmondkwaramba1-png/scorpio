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
  // NOT currently hard-blocking on email verification, even though the
  // account genuinely isn't verified yet — Resend is still sandboxed
  // (unverified sending domain), which means it can only deliver to the
  // platform operator's own inbox and silently fails for every real
  // signup. A hard redirect here, combined with that, meant literally no
  // new user could ever get past signup — confirmed live, not assumed:
  // production logs showed "[EMAIL FAILED] ... You can only send testing
  // emails to your own email address" for every real test signup. Once a
  // real sending domain is verified in Resend, re-enable the block below.
  //
  // if (!user.email_verified_at && location.pathname !== '/check-email') {
  //   return <Navigate to="/check-email" replace />;
  // }
  return children;
}
