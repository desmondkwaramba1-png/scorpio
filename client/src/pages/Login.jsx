import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FiShoppingBag, FiShoppingCart, FiEye, FiEyeOff, FiCheck } from 'react-icons/fi';
import { FcGoogle } from 'react-icons/fc';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';

// Google's OAuth app cleared verification and is published out of
// "Testing." Confirmed for real, not just by console status: hit the
// live /api/auth/google redirect directly, followed it through to
// Google's own accounts.google.com page, got back a genuine "Sign in -
// Google Accounts" page (not a redirect_uri_mismatch/invalid_client
// error, which Google shows immediately, before any login prompt, if
// either were wrong) — client_id and redirect_uri are both correctly
// registered. The one thing that can't be verified without an actual
// human completing a real login is the token-exchange step
// (GOOGLE_CLIENT_SECRET, only ever used after a real user consents).
// Facebook has no button wired up below regardless, only Google does —
// this flag has nothing left to gate for Facebook to flip separately.
const SOCIAL_LOGIN_ENABLED = true;

// A plain <input type="password"> gives no way to check what you actually
// typed before submitting, a real source of failed logins/signups on a
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

  // Role only matters for a brand-new signup (does this new account want
  // to land in onboarding right away?), it's not something a RETURNING
  // user should have to re-declare every time they log in. A "role=creator"
  // deep link (the various "Start selling" CTAs) jumps straight to signup;
  // "role=buyer" deep links (every "log in to continue" prompt, which all
  // carry `next`) jump straight to login, in both cases the picker below
  // is redundant with what the caller already knows.
  // Both roles land on the signup tab, not just 'creator' — this used to
  // only check presetRole === 'creator', so a brand-new buyer clicking
  // any "Buy"/"Log in to buy this" prompt (all of them link here with
  // ?role=buyer) landed on the *login* form despite having no account
  // yet, with signupRole quietly pre-set to 'buyer' on a tab they'd
  // never see unless they noticed and clicked "Create account" first.
  // Confirmed live before this fix: /login?role=buyer really did render
  // "Welcome back" with the Log in tab active.
  const [tab, setTab] = useState(presetRole ? 'signup' : 'login');
  const [signupRole, setSignupRole] = useState(presetRole === 'creator' ? 'creator' : presetRole === 'buyer' ? 'buyer' : null);
  // The signup form used to be one long scroll (Google button, 5 fields,
  // terms) - real feedback was that it read as too long, especially on
  // desktop where a tall narrow card wastes all the extra width instead
  // of using it. Split into 2 short steps (same wizard-steps pattern
  // Onboarding.jsx already uses for the creator setup flow) so it's a
  // couple of fields at a time with a real Next/Back, not one wall of
  // inputs.
  const [signupStep, setSignupStep] = useState(0);
  const [form, setForm] = useState({ identifier: '', username: '', email: '', phone: '', password: '', confirm: '', terms: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const update = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  // tab/signupRole above only ever read presetRole once, at whatever
  // moment this component first mounted. That's fine arriving fresh from
  // another page, but the nav's own "Start selling" link (and every
  // other role=creator/buyer deep link) points at this same /login
  // route - clicking one while already sitting on /login only changes
  // the query string, React Router re-renders the same mounted
  // component rather than remounting it, so nothing above ever re-ran
  // and the click visibly did nothing. Confirmed live: on /login with
  // the Log in tab open, "Start selling" changed the URL but left the
  // page exactly as it was. Re-syncing whenever the URL's actual role
  // changes fixes that without touching the deliberate one-time-read
  // behavior for a normal first visit.
  useEffect(() => {
    if (presetRole === 'creator' || presetRole === 'buyer') {
      setTab('signup');
      setSignupRole(presetRole);
      setSignupStep(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetRole]);

  // Real feedback: clicking Continue landed on "half of it", not the
  // top of the next step - because it genuinely did. Swapping which
  // fields render doesn't move the page at all, so whatever scroll
  // position filling in the previous step's fields left you at (often
  // scrolled well down, especially on a phone keyboard) is exactly
  // where the next step's fields first appear too, cut off mid-form
  // instead of starting clean like a real "next page" should.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab, signupRole, signupStep]);

  function pickRole(role) {
    setSignupRole(role);
    setSignupStep(0);
    setError(null);
  }

  function nextSignupStep() {
    setError(null);
    if (!form.username || !form.email || !form.phone) {
      setError('Fill in your username, email, and phone number.');
      return;
    }
    setSignupStep(1);
  }

  // Actual account state (does this user already have a creator profile?)
  // always wins over anything picked on the way in, that's what lets a
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
  // tab is meaningless either way, afterAuth/OAuthComplete decide purely
  // from data.creator once control comes back. Only the signup tab's
  // explicit choice is real intent worth sending through; anything else is
  // left unset (not defaulted to 'buyer') so OAuthComplete.jsx knows to
  // actually ask a genuinely new account rather than silently guessing.
  const oauthRole = tab === 'signup' && signupRole ? signupRole : null;
  const googleQuery = [oauthRole && `role=${oauthRole}`, next && `next=${encodeURIComponent(next)}`]
    .filter(Boolean).join('&');

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
    <AuthShell wide={tab === 'signup'}>
      <h1 style={{ fontSize: '1.6rem', marginBottom: 6 }}>
        {tab === 'login' ? 'Welcome back' : 'Create your account'}
      </h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        {tab === 'login' ? 'Good to see you again.' : 'One account covers both sides, you can browse, buy, and open a storefront later even if you start as a buyer.'}
      </p>

      <div className="tabs" style={{ marginBottom: 24 }}>
        <button className={`tab${tab === 'login' ? ' tab--active' : ''}`} onClick={() => { setTab('login'); setError(null); }}>
          Log in
        </button>
        <button className={`tab${tab === 'signup' ? ' tab--active' : ''}`} onClick={() => { setTab('signup'); setSignupRole(null); setSignupStep(0); setError(null); }}>
          Create account
        </button>
      </div>

      {tab === 'signup' && !signupRole && (
        <div className="role-grid" style={{ marginBottom: 24 }}>
          <button className="role-card" onClick={() => pickRole('creator')}>
            <div className="role-card__icon"><FiShoppingBag /></div>
            <p className="role-card__title">I'm a creator</p>
            <p className="role-card__sub">Sell products, manage your storefront and payouts.</p>
          </button>
          <button className="role-card" onClick={() => pickRole('buyer')}>
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
              <button type="button" onClick={() => { setSignupRole(null); setSignupStep(0); }} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--gold-ink)', fontWeight: 600, cursor: 'pointer' }}>
                change
              </button>
            </p>
          )}

          {tab === 'signup' && (
            <div className="wizard-steps wizard-steps--labeled" style={{ marginBottom: 24 }}>
              <div className={`wizard-step${signupStep === 0 ? ' wizard-step--active' : ' wizard-step--done'}`}>
                <span className="wizard-step__circle">{signupStep > 0 ? <FiCheck size={13} /> : 1}</span>
                <span className="wizard-step__label">Account</span>
              </div>
              <div className="wizard-connector" />
              <div className={`wizard-step${signupStep === 1 ? ' wizard-step--active' : ''}`}>
                <span className="wizard-step__circle">2</span>
                <span className="wizard-step__label">Security</span>
              </div>
            </div>
          )}

          {searchParams.get('oauth_error') && (
            <p className="error-text" style={{ marginBottom: 16 }}>That sign-in didn't go through. Use your email and password below.</p>
          )}

          {/* Google's OAuth app cleared "Testing" — see the note on
              SOCIAL_LOGIN_ENABLED above for how that was actually
              confirmed, not just assumed from console status. Facebook
              still has no button here at all (never did), only its own
              Meta App Review would change that, a separate step this
              flag doesn't gate. Only shown on signup's first step - a
              full alternative to the whole form makes sense before
              anyone's typed anything into it, not once they're partway
              through with real progress to lose. */}
          {SOCIAL_LOGIN_ENABLED && (tab === 'login' || signupStep === 0) && (
            <>
              <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
                <a href={`/api/auth/google${googleQuery ? `?${googleQuery}` : ''}`} className="btn btn--ghost btn--block">
                  <FcGoogle size={18} /> Continue with Google
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
            </>
          )}

          {tab === 'login' && (
            <form onSubmit={handleLogin}>
              <div className="field">
                <label htmlFor="identifier">Username or email</label>
                <input id="identifier" required value={form.identifier} onChange={update('identifier')} autoFocus />
              </div>
              <PasswordField
                id="password" label="Password" value={form.password} onChange={update('password')}
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
            <form onSubmit={signupStep === 0 ? (e) => { e.preventDefault(); nextSignupStep(); } : handleSignup}>
              {signupStep === 0 && (
                <>
                  <div className="field">
                    <label htmlFor="username">Username</label>
                    <input id="username" required value={form.username} onChange={update('username')} autoFocus />
                    <small>Letters, numbers, and underscores. This is what shows on your profile.</small>
                  </div>
                  <div className="field-row">
                    <div className="field">
                      <label htmlFor="email">Email</label>
                      <input id="email" type="email" required value={form.email} onChange={update('email')} placeholder="you@example.com" />
                      <small>We'll send a verification link here.</small>
                    </div>
                    <div className="field">
                      <label htmlFor="phone">Phone number</label>
                      <input id="phone" required value={form.phone} onChange={update('phone')} placeholder="+263 77 123 4567" />
                      <small>Shown to buyers or sellers you have an order with, so they can reach you on WhatsApp.</small>
                    </div>
                  </div>
                  {error && <p className="error-text">{error}</p>}
                  <button className="btn btn--primary btn--block" type="submit">Continue</button>
                </>
              )}

              {signupStep === 1 && (
                <>
                  <div className="field-row">
                    <PasswordField
                      id="signup_password" label="Password" value={form.password} onChange={update('password')}
                      minLength={8} hint="At least 8 characters, pick something you don't use anywhere else."
                    />
                    <PasswordField
                      id="confirm" label="Confirm password" value={form.confirm} onChange={update('confirm')}
                    />
                  </div>
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
                  <div className="btn-row">
                    <button type="button" className="btn btn--ghost" onClick={() => { setError(null); setSignupStep(0); }}>
                      Back
                    </button>
                    <button className="btn btn--primary" style={{ flex: 1 }} disabled={submitting} type="submit">
                      {submitting ? 'Creating account...' : 'Create account'}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </>
      )}
    </AuthShell>
  );
}
