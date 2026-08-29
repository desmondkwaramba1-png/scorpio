import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Landed on after a Google/Facebook redirect — the backend already set the
// session cookie, this page just refreshes auth state and routes onward.
export default function OAuthComplete() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refresh } = useAuth();

  useEffect(() => {
    // Same rule as Login.jsx's afterAuth: actual account state wins over
    // whatever role was picked on the way in, so a returning creator lands
    // on their dashboard regardless of which link they clicked, and role
    // only decides anything for a genuinely brand-new signup.
    const role = searchParams.get('role') === 'buyer' ? 'buyer' : 'creator';
    const next = searchParams.get('next');
    refresh().then(({ creator }) => {
      if (next) {
        navigate(next, { replace: true });
      } else if (creator) {
        navigate('/dashboard', { replace: true });
      } else if (role === 'creator') {
        navigate('/onboarding', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="wrap" style={{ padding: '80px 20px', textAlign: 'center' }}>
      <p className="muted">Signing you in...</p>
    </div>
  );
}
