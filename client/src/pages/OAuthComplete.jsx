import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FiShoppingBag, FiShoppingCart } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';

// Landed on after a Google/Facebook redirect — the backend already set the
// session cookie, this page just refreshes auth state and routes onward.
export default function OAuthComplete() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refresh } = useAuth();
  const [asking, setAsking] = useState(false);

  const next = searchParams.get('next');
  const roleParam = searchParams.get('role');
  const presetRole = roleParam === 'buyer' || roleParam === 'creator' ? roleParam : null;
  const isNew = searchParams.get('is_new') === '1';

  useEffect(() => {
    refresh().then(({ creator }) => {
      // Actual account state always wins — a returning creator lands on
      // their dashboard no matter what, same rule as Login.jsx's afterAuth.
      if (creator) { navigate('/dashboard', { replace: true }); return; }
      if (next) { navigate(next, { replace: true }); return; }
      if (presetRole === 'creator') { navigate('/onboarding', { replace: true }); return; }
      if (presetRole === 'buyer') { navigate('/', { replace: true }); return; }
      // Genuinely new account, no explicit role picked on the way in (this
      // is what a plain "Continue with Google" click from the login tab
      // looks like now — see Login.jsx's oauthRole) — this is the moment to
      // actually ask, instead of silently defaulting to buyer.
      if (isNew) { setAsking(true); return; }
      navigate('/', { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (asking) {
    return (
      <div className="wrap" style={{ maxWidth: 420, padding: '64px 20px' }}>
        <h1 style={{ fontSize: '1.4rem', marginBottom: 6, textAlign: 'center' }}>One quick thing</h1>
        <p className="muted" style={{ textAlign: 'center', marginBottom: 24 }}>Are you here to sell, or to buy?</p>
        <div className="role-grid">
          <button className="role-card" onClick={() => navigate('/onboarding', { replace: true })}>
            <div className="role-card__icon"><FiShoppingBag /></div>
            <p className="role-card__title">I'm a creator</p>
            <p className="role-card__sub">Sell products, manage your storefront and payouts.</p>
          </button>
          <button className="role-card" onClick={() => navigate('/', { replace: true })}>
            <div className="role-card__icon"><FiShoppingCart /></div>
            <p className="role-card__title">I'm a buyer</p>
            <p className="role-card__sub">Track your orders and re-download what you bought.</p>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap" style={{ padding: '80px 20px', textAlign: 'center' }}>
      <p className="muted">Signing you in...</p>
    </div>
  );
}
