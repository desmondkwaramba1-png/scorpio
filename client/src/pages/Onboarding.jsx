import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { FiCheck } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api';
import FileUpload from '../components/FileUpload.jsx';
import AuthShell from '../components/AuthShell.jsx';
import { SITE_HOST } from '../lib/site.js';

const STEPS = ['Basics', 'About', 'Payout', 'Review'];

// Mirrors the backend's exact rule (see routes/creators.js's HANDLE_RE) ,
// duplicated here isn't ideal, but a handle is validated in exactly one
// place server-side and there's no shared module between client/server
// to import it from. Kept in sync deliberately, not incidentally.
const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;
function handleError(handle) {
  if (!handle) return 'Pick a handle.';
  if (!HANDLE_RE.test(handle)) return 'Lowercase letters, numbers, and hyphens only, no spaces, no starting/ending with a hyphen.';
  return null;
}

export default function Onboarding() {
  const { creator, refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    handle: '', name: '', bio: '', what_selling: '', who_for: '', payout_ecocash_number: ''
  });
  const [avatar, setAvatar] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Clicking Continue swaps which fields render but never moves the
  // page - whatever scroll position the previous step left you at
  // (often well down, especially filling a long step on a phone
  // keyboard) is exactly where the next step's fields first appear
  // too, instead of starting at the top like a real next step should.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  if (creator) return <Navigate to="/dashboard" replace />;

  const update = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));
  // Lowercase as they type rather than only complaining after the fact ,
  // "TendaiWrites" becoming "tendaiwrites" on its own prevents the single
  // most common way to trip the handle rule, instead of catching it once
  // it's already wrong.
  const updateHandle = (e) => setForm(f => ({ ...f, handle: e.target.value.toLowerCase() }));
  const handleInvalid = handleError(form.handle);

  function next() {
    setError(null);
    if (step === 0) {
      if (handleInvalid) { setError(handleInvalid); return; }
      if (!form.name) { setError('Your name is required.'); return; }
    }
    if (step === 1 && (!form.what_selling || !form.who_for)) {
      setError('Both questions are required.');
      return;
    }
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  }
  function back() { setError(null); setStep(s => Math.max(s - 1, 0)); }

  function handleAvatar(e) {
    const file = e.target.files[0];
    setAvatar(file);
    setAvatarPreview(file ? URL.createObjectURL(file) : null);
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    const body = new FormData();
    Object.entries(form).forEach(([k, v]) => body.append(k, v));
    if (avatar) body.append('avatar', avatar);

    try {
      await api.post('/api/creators', body);
      await refresh();
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <AuthShell wide>
      <h1 style={{ fontSize: '1.6rem', marginBottom: 6 }}>Set up your storefront</h1>
      <p className="muted" style={{ marginBottom: 32 }}>Four short steps. Takes about two minutes.</p>

      <div className="wizard-steps">
        {STEPS.map((label, i) => (
          <div key={label} style={{ display: 'contents' }}>
            <div className={`wizard-step${i === step ? ' wizard-step--active' : ''}${i < step ? ' wizard-step--done' : ''}`}>
              <span className="wizard-step__circle">{i < step ? <FiCheck size={13} /> : i + 1}</span>
              <span className="wizard-step__label">{label}</span>
            </div>
            {i < STEPS.length - 1 && <div className="wizard-connector" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div>
          <div className="field">
            <label htmlFor="handle">Handle</label>
            <input id="handle" required value={form.handle} onChange={updateHandle} autoFocus />
            {form.handle && handleInvalid ? (
              <small style={{ color: 'var(--red)' }}>{handleInvalid}</small>
            ) : (
              <small>Your storefront: {SITE_HOST}/@{form.handle || 'yourhandle'}. Can't be changed later.</small>
            )}
          </div>
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input id="name" required value={form.name} onChange={update('name')} />
          </div>
          <div className="field">
            <label htmlFor="bio">A short bio</label>
            <textarea id="bio" value={form.bio} onChange={update('bio')} placeholder="Who are you, in a sentence or two?" />
          </div>
          <div className="field">
            <label htmlFor="avatar">Profile photo</label>
            <FileUpload id="avatar" accept="image/*" onChange={handleAvatar}
              label={avatar ? 'Photo ready' : 'Choose a profile photo'}
              crop={{ aspect: 1, round: true }} />
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="field">
            <label htmlFor="what_selling">What are you selling?</label>
            <textarea id="what_selling" required value={form.what_selling} onChange={update('what_selling')}
              placeholder="e.g. A weekly newspaper covering local Chitungwiza news" />
          </div>
          <div className="field">
            <label htmlFor="who_for">Who is it for?</label>
            <textarea id="who_for" required value={form.who_for} onChange={update('who_for')}
              placeholder="e.g. Residents and businesses who want real local news" />
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="field">
            <label htmlFor="payout_ecocash_number">EcoCash number</label>
            <input id="payout_ecocash_number" value={form.payout_ecocash_number} onChange={update('payout_ecocash_number')}
              placeholder="077 123 4567" />
            <small>Where your earnings get paid out. You can add this later in Settings if you don't have it now.</small>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card card--pad" style={{ marginBottom: 20 }}>
          <p style={{ fontWeight: 600, marginBottom: 14 }}>Review</p>
          <div style={{ display: 'grid', gap: 8, fontSize: '.9rem' }}>
            <p><span className="muted">Handle</span> &nbsp; @{form.handle}</p>
            <p><span className="muted">Name</span> &nbsp; {form.name}</p>
            <p><span className="muted">Selling</span> &nbsp; {form.what_selling}</p>
            <p><span className="muted">For</span> &nbsp; {form.who_for}</p>
            <p><span className="muted">EcoCash</span> &nbsp; {form.payout_ecocash_number || 'Not added yet'}</p>
          </div>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="btn-row" style={{ marginTop: 24 }}>
        {step > 0 && <button className="btn btn--ghost" type="button" onClick={back}>Back</button>}
        {step < STEPS.length - 1 && (
          <button
            className="btn btn--primary" style={{ flex: 1 }} type="button" onClick={next}
            disabled={step === 0 && (!!handleInvalid || !form.name) || (step === 1 && (!form.what_selling || !form.who_for))}
          >
            Continue
          </button>
        )}
        {step === STEPS.length - 1 && (
          <button className="btn btn--gold" style={{ flex: 1 }} type="button" onClick={submit} disabled={submitting}>
            {submitting ? 'Creating...' : 'Create my storefront'}
          </button>
        )}
      </div>
    </AuthShell>
  );
}
