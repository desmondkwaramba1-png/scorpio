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
  return children;
}
