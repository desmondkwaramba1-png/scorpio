import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiCheck, FiX } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api';
import FileUpload from '../components/FileUpload.jsx';
import { SITE_HOST } from '../lib/site.js';

const DRAFT_KEY = 'scorpio_setup_draft';

const STEPS = [
  { title: 'Name your store', hint: 'This is what buyers will see and remember.' },
  { title: 'Tell buyers what you do', hint: 'A clear promise helps the right people trust you.' },
  { title: 'How should we pay you?', hint: 'Earnings are sent to this EcoCash number every Friday.' },
  { title: 'Ready to open your store', hint: 'Check your details. You can change most of this later.' }
];

// Mirrors the backend's rule in routes/creators.js. There is no shared module
// between client and server to import it from.
const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;
const ECOCASH_RE = /^(\+263|0)\d{9}$/;

function handleError(handle) {
  if (!handle) return 'Pick a store link.';
  if (!HANDLE_RE.test(handle)) return 'Use 3 to 30 lowercase letters, numbers or hyphens. No hyphen at the start or end.';
  return null;
}

const toHandle = name => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '');

function readDraft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY)) || null; } catch { return null; }
}

function StorePreview({ form, photo }) {
  return (
    <div className="setup-preview" aria-hidden="true">
      <p className="setup-preview__label">Your store</p>
      <div className="setup-preview__card">
        <div className="setup-preview__banner" />
        <div className="setup-preview__body">
          <span className="setup-preview__avatar" style={photo ? { backgroundImage: `url(${photo})` } : undefined}>
            {!photo && (form.name.trim().charAt(0).toUpperCase() || 'S')}
          </span>
          <p className="setup-preview__name">{form.name.trim() || 'Your store name'}</p>
          <p className="setup-preview__link mono">{SITE_HOST}/@{form.handle || 'yourstore'}</p>
          <p className="setup-preview__bio">{form.bio.trim() || form.what_selling.trim() || 'What you sell will show up here.'}</p>
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ label, value, onEdit }) {
  return (
    <div className="setup-review__row">
      <div>
        <p className="setup-review__label">{label}</p>
        <p className="setup-review__value">{value}</p>
      </div>
      <button type="button" className="setup-review__edit" onClick={onEdit} aria-label={`Edit ${label}`}>Edit</button>
    </div>
  );
}

export default function Onboarding() {
  const { creator, refresh } = useAuth();
  const navigate = useNavigate();
  const [saved] = useState(readDraft);
  const [step, setStep] = useState(saved?.step || 0);
  const [form, setForm] = useState(saved?.form || {
    handle: '', name: '', bio: '', what_selling: '', who_for: '', payout_ecocash_number: ''
  });
  const [handleEdited, setHandleEdited] = useState(!!saved?.form?.handle);
  const [handleTaken, setHandleTaken] = useState(false);
  const [avatar, setAvatar] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  // A dropped connection or a reload shouldn't send anyone back to step one.
  useEffect(() => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, form })); } catch { /* storage blocked */ }
  }, [step, form]);

  // Checked while typing, so a taken link can't surprise anyone at the last step.
  useEffect(() => {
    setHandleTaken(false);
    if (handleError(form.handle)) return undefined;
    const timer = setTimeout(() => {
      fetch(`/api/creators/${form.handle}`).then(res => setHandleTaken(res.ok)).catch(() => {});
    }, 350);
    return () => clearTimeout(timer);
  }, [form.handle]);

  if (creator) return <Navigate to="/dashboard" replace />;

  const update = key => e => setForm(f => ({ ...f, [key]: e.target.value }));
  const updateName = e => {
    const name = e.target.value;
    setForm(f => ({ ...f, name, handle: handleEdited ? f.handle : toHandle(name) }));
  };
  const updateHandle = e => {
    setHandleEdited(true);
    setForm(f => ({ ...f, handle: e.target.value.toLowerCase().replace(/\s+/g, '-') }));
  };

  const handleProblem = handleTaken ? 'That link is taken. Try another.' : handleError(form.handle);
  const payout = form.payout_ecocash_number.replace(/[\s-]+/g, '');
  const payoutProblem = payout && !ECOCASH_RE.test(payout) ? 'Enter a number like 0771234567 or +263771234567.' : null;
  const stepBlocked = (step === 0 && (!!handleProblem || !form.name.trim()))
    || (step === 1 && (!form.what_selling.trim() || !form.who_for.trim()))
    || (step === 2 && !!payoutProblem);

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
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* storage blocked */ }
      await refresh();
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
      if (/handle/i.test(err.message)) setStep(0);
      setSubmitting(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    if (stepBlocked) return;
    setError(null);
    if (step === STEPS.length - 1) submit();
    else setStep(s => s + 1);
  }

  const last = step === STEPS.length - 1;
  const primaryLabel = last ? (submitting ? 'Creating your store...' : 'Create my storefront')
    : step === 2 && !payout ? 'Skip for now' : 'Continue';

  return (
    <div className="setup">
      <header className="setup__top">
        <span className="nav__name setup__brand">Scorpio</span>
        <Link to="/" className="setup__exit" aria-label="Exit store setup"><FiX size={20} /></Link>
      </header>
      <div className="setup__progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => <span key={s.title} className={i <= step ? 'is-done' : ''} />)}
      </div>

      <form className="setup__layout" onSubmit={onSubmit} noValidate>
        <div className="setup__main">
          <p className="setup__count">Step {step + 1} of {STEPS.length}</p>
          <h1 className="setup__title">{STEPS[step].title}</h1>
          <p className="setup__hint">{STEPS[step].hint}</p>

          {step === 0 && (
            <div className="setup__card">
              <div className="field">
                <label htmlFor="name">Store name</label>
                <input id="name" required value={form.name} onChange={updateName} autoComplete="organization" placeholder="e.g. Rudo's Guides" />
              </div>
              <div className="field">
                <label htmlFor="handle">Store link</label>
                <div className="setup__prefixed">
                  <span>{SITE_HOST}/@</span>
                  <input id="handle" required value={form.handle} onChange={updateHandle} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="handle-note" />
                </div>
                {form.handle && handleProblem
                  ? <small id="handle-note" className="setup__field-error">{handleProblem}</small>
                  : <small id="handle-note">This can't be changed later, so pick one you'll keep.</small>}
              </div>
              <div className="field">
                <label htmlFor="avatar">Store photo <span className="setup__optional">Optional</span></label>
                <FileUpload id="avatar" accept="image/*" onChange={handleAvatar}
                  label={avatar ? 'Photo ready' : 'Choose a photo'} crop={{ aspect: 1, round: true }} />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="setup__card">
              <div className="field">
                <label htmlFor="what_selling">What are you selling?</label>
                <textarea id="what_selling" required rows={2} value={form.what_selling} onChange={update('what_selling')}
                  placeholder="e.g. Practical guides for small shop owners" />
              </div>
              <div className="field">
                <label htmlFor="who_for">Who is it for?</label>
                <textarea id="who_for" required rows={2} value={form.who_for} onChange={update('who_for')}
                  placeholder="e.g. People starting a tuck shop in Zimbabwe" />
              </div>
              <div className="field">
                <label htmlFor="bio">A short bio <span className="setup__optional">Optional</span></label>
                <textarea id="bio" rows={2} value={form.bio} onChange={update('bio')} placeholder="Who are you, in a sentence or two?" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="setup__card">
              <div className="field">
                <label htmlFor="payout_ecocash_number">EcoCash number <span className="setup__optional">Optional for now</span></label>
                <input id="payout_ecocash_number" type="tel" inputMode="tel" autoComplete="tel" value={form.payout_ecocash_number}
                  onChange={update('payout_ecocash_number')} placeholder="07X XXX XXXX" />
                {payoutProblem
                  ? <small className="setup__field-error">{payoutProblem}</small>
                  : <small>You can sell without it, but we'll need it before we can pay you.</small>}
              </div>
            </div>
          )}

          {last && (
            <div className="setup__card setup-review">
              <ReviewRow label="Store" value={`${form.name} (@${form.handle})`} onEdit={() => setStep(0)} />
              <ReviewRow label="Selling" value={form.what_selling} onEdit={() => setStep(1)} />
              <ReviewRow label="For" value={form.who_for} onEdit={() => setStep(1)} />
              <ReviewRow label="EcoCash" value={form.payout_ecocash_number || 'Not added yet'} onEdit={() => setStep(2)} />
              <p className="setup-review__next"><FiCheck size={15} /> Next, you'll add your first product.</p>
            </div>
          )}

          {error && <p className="error-text">{error}</p>}
        </div>

        <aside className="setup__side"><StorePreview form={form} photo={avatarPreview} /></aside>

        <div className="setup__actions">
          {step > 0 && (
            <button className="btn btn--ghost setup__back" type="button" onClick={back} aria-label="Back to the previous step">
              <FiArrowLeft size={18} />
            </button>
          )}
          <button className="btn btn--primary setup__next" type="submit" disabled={stepBlocked || submitting}>{primaryLabel}</button>
        </div>
      </form>
    </div>
  );
}
