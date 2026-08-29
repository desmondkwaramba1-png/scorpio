import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FiShoppingBag, FiShoppingCart, FiEye, FiEyeOff } from 'react-icons/fi';
import { FcGoogle } from 'react-icons/fc';
import { FaFacebook } from 'react-icons/fa';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext.jsx';

// A plain <input type="password"> gives no way to check what you actually
// typed before submitting — a real source of failed logins/signups on a
// fiddly mobile keyboard. tabIndex={-1} keeps the toggle out of the tab
// order between the field and the next one; it's a convenience click/tap
// target, not a stop on the form's real path.
function PasswordField({ id, label, value, onChange, placeholder, hint, minLength }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field__password-wrap">
        <input
          id={id} type={show ? 'text' : 'password'} required minLength={minLength}
          value={value} onChange={onChange} placeholder={placeholder}
        />
        <button
          type="button" tabIndex={-1} className="field__password-toggle"
          onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <FiEyeOff size={16} /> : <FiEye size={16} />}
        </button>
      </div>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [searchParams] = useSearchParams();
  const presetRole = searchParams.get('role');
  const next = searchParams.get('next');
  const nextQuery = next ? `&next=${encodeURIComponent(next)}` : '';

  // Role only matters for a brand-new signup (does this new account want
  // to land in onboarding right away?) — it's not something a RETURNING
  // user should have to re-declare every time they log in. A "role=creator"
  // deep link (the various "Start selling" CTAs) jumps straight to signup;
  // "role=buyer" deep links (every "log in to continue" prompt, which all
  // carry `next`) jump straight to login — in both cases the picker below
  // is redundant with what the caller already knows.
  const [tab, setTab] = useState(presetRole === 'creator' ? 'signup' : 'login');
  const [signupRole, setSignupRole] = useState(presetRole === 'creator' ? 'creator' : presetRole === 'buyer' ? 'buyer' : null);
  const [form, setForm] = useState({ identifier: '', username: '', email: '', phone: '', password: '', confirm: '', terms: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const update = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  // Actual account state (does this user already have a creator profile?)
  // always wins over anything picked on the way in — that's what lets a
  // returning seller land on their dashboard without re-declaring "I'm a
  // creator" every single login, and it's also what makes a buyer who
  // later opens a storefront (see Account.jsx) land correctly from then on.
  function afterAuth(data) {
    if (next) { navigate(next); return; }
    if (data.creator) { navigate('/dashboard'); return; }
    if (tab === 'signup' && signupRole === 'creator') { navigate('/onboarding'); return; }
    navigate('/');
  }

  // OAuth login doesn't know in advance whether it'll create a brand-new
  // account or sign into an existing one, so a role picked in the login
  // tab is meaningless either way — afterAuth/OAuthComplete decide purely
  // from data.creator once control comes back. Only the signup tab's
  // explicit choice is real intent worth sending through.
  const oauthRole = tab === 'signup' && signupRole ? signupRole : 'buyer';

  async function handleLogin(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = await api.post('/api/auth/login', { identifier: form.identifier, password: form.password });
      await refresh();
      afterAuth(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const data = await api.post('/api/auth/signup', {
        username: form.username, email: form.email, phone: form.phone, password: form.password,
        terms_accepted: form.terms
      });
      await refresh();
      afterAuth(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="wrap" style={{ maxWidth: 420, padding: '56px 20px 80px' }}>
      <h1 style={{ fontSize: '1.7rem', marginBottom: 6 }}>
        {tab === 'login' ? 'Log in to SCORPIO' : 'Create your SCORPIO account'}
      </h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        {tab === 'login' ? 'Welcome back.' : "One account covers both sides. Sellers can browse and buy too, and you can open a storefront later even if you start as a buyer."}
      </p>

      <div className="tabs" style={{ marginBottom: 24 }}>
        <button className={`tab${tab === 'login' ? ' tab--active' : ''}`} onClick={() => { setTab('login'); setError(null); }}>
          Log in
        </button>
        <button className={`tab${tab === 'signup' ? ' tab--active' : ''}`} onClick={() => { setTab('signup'); setSignupRole(null); setError(null); }}>
          Create account
        </button>
      </div>

      {tab === 'signup' && !signupRole && (
        <div className="role-grid" style={{ marginBottom: 24 }}>
          <button className="role-card" onClick={() => setSignupRole('creator')}>
            <div className="role-card__icon"><FiShoppingBag /></div>
            <p className="role-card__title">I'm a creator</p>
            <p className="role-card__sub">Sell products, manage your storefront and payouts.</p>
          </button>
          <button className="role-card" onClick={() => setSignupRole('buyer')}>
            <div className="role-card__icon"><FiShoppingCart /></div>
            <p className="role-card__title">I'm a buyer</p>
            <p className="role-card__sub">Track your orders and re-download what you bought.</p>
          </button>
        </div>
      )}

      {(tab === 'login' || signupRole) && (
        <>
          {tab === 'signup' && (
            <p className="muted" style={{ fontSize: '.85rem', marginBottom: 16 }}>
              Signing up as a {signupRole === 'creator' ? 'creator' : 'buyer'}.{' '}
              <button type="button" onClick={() => setSignupRole(null)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--green-glow)', fontWeight: 600, cursor: 'pointer' }}>
                change
              </button>
            </p>
          )}

          {searchParams.get('oauth_error') === 'not_configured' && (
            <p className="error-text" style={{ marginBottom: 16 }}>
              {searchParams.get('provider') === 'facebook' ? 'Facebook' : 'Google'} sign-in isn't set up yet. Use email/password below instead.
            </p>
          )}
          {searchParams.get('oauth_error') && searchParams.get('oauth_error') !== 'not_configured' && (
            <p className="error-text" style={{ marginBottom: 16 }}>That sign-in didn't go through. Try again.</p>
          )}

          <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
            <a href={`/api/auth/google?role=${oauthRole}${nextQuery}`} className="btn btn--ghost btn--block">
              <FcGoogle size={18} /> Continue with Google
            </a>
            <a href={`/api/auth/facebook?role=${oauthRole}${nextQuery}`} className="btn btn--ghost btn--block">
              <FaFacebook size={18} color="#1877F2" /> Continue with Facebook
            </a>
          </div>
          <p className="muted" style={{ fontSize: '.78rem', textAlign: 'center', marginTop: -10 }}>
            Continuing means you'll be asked to agree to the <Link to="/terms" target="_blank" style={{ color: 'var(--green)' }}>terms</Link> on your first visit.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0', color: 'var(--muted)', fontSize: '.8rem' }}>
            <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            or
            <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>

          {tab === 'login' && (
            <form onSubmit={handleLogin}>
              <div className="field">
                <label htmlFor="identifier">Username or email</label>
                <input id="identifier" required value={form.identifier} onChange={update('identifier')} placeholder="myusername" />
              </div>
              <PasswordField
                id="password" label="Password" value={form.password} onChange={update('password')} placeholder="mypassword"
              />
              {error && <p className="error-text">{error}</p>}
              <button className="btn btn--primary btn--block" disabled={submitting} type="submit">
                {submitting ? 'Logging in...' : 'Log in'}
              </button>
              <p style={{ textAlign: 'center', marginTop: 16 }}>
                <Link to="/forgot-password" className="muted" style={{ fontSize: '.88rem', fontWeight: 600 }}>
                  Forgot your password?
                </Link>
              </p>
            </form>
          )}

          {tab === 'signup' && (
            <form onSubmit={handleSignup}>
              <div className="field">
                <label htmlFor="username">Username</label>
                <input id="username" required value={form.username} onChange={update('username')} placeholder="myusername" />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" required value={form.email} onChange={update('email')} placeholder="you@example.com" />
                <small>We'll send a verification link here.</small>
              </div>
              <div className="field">
                <label htmlFor="phone">Phone number</label>
                <input id="phone" required value={form.phone} onChange={update('phone')} placeholder="+263 77 123 4567" />
                <small>Used for WhatsApp password reset and payouts.</small>
              </div>
              <PasswordField
                id="signup_password" label="Password" value={form.password} onChange={update('password')}
                placeholder="mypassword" minLength={8} hint="At least 8 characters."
              />
              <PasswordField
                id="confirm" label="Confirm password" value={form.confirm} onChange={update('confirm')} placeholder="mypassword"
              />
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'flex-start', fontWeight: 400, gap: 8 }}>
                  <input type="checkbox" required checked={form.terms}
                    onChange={e => setForm(f => ({ ...f, terms: e.target.checked }))}
                    style={{ width: 'auto', marginTop: 3 }} />
                  <span>
                    I agree to the <Link to="/terms" target="_blank" style={{ color: 'var(--green)', fontWeight: 600 }}>SCORPIO terms</Link>.
                  </span>
                </label>
              </div>
              {error && <p className="error-text">{error}</p>}
              <button className="btn btn--primary btn--block" disabled={submitting} type="submit">
                {submitting ? 'Creating account...' : 'Create account'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
