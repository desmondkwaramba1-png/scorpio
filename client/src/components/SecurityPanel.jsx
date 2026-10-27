import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiShield, FiLock, FiMonitor, FiLogOut, FiCheck, FiAlertCircle, FiEye, FiEyeOff } from 'react-icons/fi';
import { api } from '../lib/api';

// Rough, honest guidance rather than a fake entropy score: length matters
// most, variety helps. The server enforces the real minimum.
function strengthOf(password) {
  if (!password) return { score: 0, label: '' };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  return { score, label: ['Too short', 'Weak', 'Okay', 'Good', 'Strong'][score] };
}

function formatWhen(iso) {
  const date = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SecurityPanel({ security, refreshSecurity }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [revoking, setRevoking] = useState(false);

  const strength = strengthOf(form.next);
  const mismatch = form.confirm && form.next !== form.confirm;
  const others = security ? security.sessions.filter(s => !s.current) : [];
  const hasPassword = security ? security.has_password : true;

  async function changePassword(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (form.next !== form.confirm) { setError('The new passwords do not match.'); return; }
    setBusy(true);
    try {
      const res = await api.post('/api/auth/change-password', { current_password: form.current, new_password: form.next });
      setForm({ current: '', next: '', confirm: '' });
      setOpen(false);
      setNotice(res.signed_out_elsewhere
        ? `Password updated. ${res.signed_out_elsewhere} other device${res.signed_out_elsewhere === 1 ? ' was' : 's were'} signed out.`
        : 'Password updated.');
      refreshSecurity();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function signOutOthers() {
    setRevoking(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.post('/api/auth/sessions/revoke-others');
      setNotice(res.revoked ? `Signed out of ${res.revoked} other device${res.revoked === 1 ? '' : 's'}.` : 'No other devices were signed in.');
      refreshSecurity();
    } catch (err) {
      setError(err.message);
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="settings-group" id="security">
      <p className="settings-group__label">Security</p>
      <div className="settings-card security">
        <div className="security__status">
          <span className={`security__pill${security?.email_verified ? ' is-ok' : ''}`}>
            {security?.email_verified ? <FiCheck size={12} /> : <FiAlertCircle size={12} />} Email {security?.email_verified ? 'verified' : 'not verified'}
          </span>
          <span className={`security__pill${hasPassword ? ' is-ok' : ''}`}>
            {hasPassword ? <FiCheck size={12} /> : <FiAlertCircle size={12} />} {hasPassword ? 'Password set' : 'No password'}
          </span>
          <span className="security__pill is-ok"><FiShield size={12} /> Payout changes protected</span>
        </div>

        <div className="settings-row settings-row--stacked">
          <div className="security__row">
            <div>
              <p className="security__title"><FiLock size={14} /> Password</p>
              <p className="security__sub">
                {hasPassword
                  ? 'Use a long, unique password. Changing it signs out every other device.'
                  : 'You signed in with a social account, so there is no password yet.'}
              </p>
            </div>
            {hasPassword
              ? <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setOpen(o => !o); setError(null); }}>{open ? 'Cancel' : 'Change password'}</button>
              : <Link to="/forgot-password" className="btn btn--ghost btn--sm">Set a password</Link>}
          </div>

          {open && hasPassword && (
            <form className="security__form" onSubmit={changePassword}>
              <div className="field">
                <label htmlFor="sec_current">Current password</label>
                <input id="sec_current" type={show ? 'text' : 'password'} autoComplete="current-password" required
                  value={form.current} onChange={e => setForm(f => ({ ...f, current: e.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="sec_new">New password</label>
                <div className="security__input">
                  <input id="sec_new" type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={8}
                    value={form.next} onChange={e => setForm(f => ({ ...f, next: e.target.value }))} />
                  <button type="button" className="security__eye" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide passwords' : 'Show passwords'}>
                    {show ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                  </button>
                </div>
                {form.next && (
                  <div className="strength" aria-live="polite">
                    <div className="strength__bars">{[1, 2, 3, 4].map(i => <i key={i} className={i <= strength.score ? `on s${strength.score}` : ''} />)}</div>
                    <span>{strength.label}</span>
                  </div>
                )}
                <small>At least 8 characters. 12 or more with mixed case and numbers is much harder to guess.</small>
              </div>
              <div className="field">
                <label htmlFor="sec_confirm">Confirm new password</label>
                <input id="sec_confirm" type={show ? 'text' : 'password'} autoComplete="new-password" required
                  value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} />
                {mismatch && <small style={{ color: 'var(--red)' }}>These do not match yet.</small>}
              </div>
              <button className="btn btn--primary btn--sm" disabled={busy || !form.current || !form.next || !!mismatch} type="submit">
                {busy ? 'Updating...' : 'Update password'}
              </button>
            </form>
          )}
        </div>

        <div className="settings-row settings-row--stacked">
          <div className="security__row">
            <div>
              <p className="security__title"><FiMonitor size={14} /> Signed-in devices</p>
              <p className="security__sub">
                {!security ? 'Checking...' : others.length === 0
                  ? 'Only this device is signed in.'
                  : `This device and ${others.length} other${others.length === 1 ? '' : 's'}.`}
              </p>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" disabled={revoking || others.length === 0} onClick={signOutOthers}>
              <FiLogOut size={13} /> {revoking ? 'Signing out...' : 'Sign out others'}
            </button>
          </div>
          {security && security.sessions.length > 0 && (
            <ul className="security__sessions">
              {security.sessions.map((s, i) => (
                <li key={i}>
                  <span>{s.current ? 'This device' : 'Another device'}</span>
                  <small>Signed in {formatWhen(s.created_at)}</small>
                  {s.current && <b>Current</b>}
                </li>
              ))}
            </ul>
          )}
          <p className="security__sub" style={{ marginTop: 10 }}>
            Not you? Sign out others, then change your password. Never share a reset link or code with anyone, including people claiming to be Scorpio.
          </p>
        </div>

        {error && <p className="error-text" role="alert" style={{ margin: '0 16px 16px' }}>{error}</p>}
        {notice && <p className="security__notice" role="status"><FiCheck size={14} /> {notice}</p>}
      </div>
    </div>
  );
}
