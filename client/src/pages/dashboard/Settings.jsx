import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { FiUser, FiCreditCard, FiCheck, FiCamera } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../lib/api';
import Seal from '../../components/Seal.jsx';
import FormSection from '../../components/FormSection.jsx';
import ImageCropper from '../../components/ImageCropper.jsx';
import ThemeToggle from '../../components/ThemeToggle.jsx';

export default function Settings() {
  const { creator, refresh } = useAuth();

  const [form, setForm] = useState({
    name: creator?.name || '',
    bio: creator?.bio || '',
    what_selling: creator?.what_selling || '',
    who_for: creator?.who_for || '',
    payout_ecocash_number: creator?.payout_ecocash_number || ''
  });
  const [avatar, setAvatar] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [cropping, setCropping] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  if (!creator) return <Navigate to="/onboarding" replace />;

  const update = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  function handleAvatar(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (file && file.type.startsWith('image/')) setCropping(file);
  }

  function applyAvatarCrop(croppedFile, previewUrl) {
    setCropping(null);
    setAvatar(croppedFile);
    setAvatarPreview(previewUrl);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    setSaved(false);

    const body = new FormData();
    Object.entries(form).forEach(([k, v]) => body.append(k, v));
    if (avatar) body.append('avatar', avatar);

    try {
      await api.patch('/api/creators/me', body);
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const avatarUrl = avatarPreview || creator.avatar_path;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: 4 }}>Storefront settings</h1>
      <p className="muted" style={{ marginBottom: 28 }}>How your storefront looks, and where your money goes.</p>

      <div className="form-layout">
        <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
          <FormSection icon={FiUser} title="Your profile">
            <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <label htmlFor="avatar" style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
                <input id="avatar" type="file" accept="image/*" onChange={handleAvatar}
                  style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0 }} />
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: avatarUrl ? `url(${avatarUrl}) center/cover` : 'var(--green-tint)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green-glow)'
                }}>
                  {!avatarUrl && <FiUser size={26} />}
                </div>
                <div style={{
                  position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: '50%',
                  background: 'var(--gold)', color: 'var(--green-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid var(--surface)'
                }}>
                  <FiCamera size={11} />
                </div>
              </label>
              <div>
                <p style={{ fontWeight: 600, fontSize: '.9rem' }}>Profile photo</p>
                <label htmlFor="avatar" className="muted" style={{ fontSize: '.82rem', fontWeight: 600, cursor: 'pointer', color: 'var(--green-glow)' }}>
                  {avatar ? 'Photo updated — save to apply' : (creator.avatar_path ? 'Change photo' : 'Choose a photo')}
                </label>
              </div>
            </div>

            {cropping && (
              <div className="field">
                <ImageCropper
                  file={cropping} aspect={1} round
                  onCancel={() => setCropping(null)}
                  onApply={applyAvatarCrop}
                />
              </div>
            )}

            <div className="field">
              <label htmlFor="name">Your name</label>
              <input id="name" required value={form.name} onChange={update('name')} />
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="bio">A short bio</label>
              <textarea id="bio" value={form.bio} onChange={update('bio')} placeholder="A line or two about who you are." />
            </div>
          </FormSection>

          <FormSection icon={FiCheck} title="Why buyers should trust you"
            note="This shows up on your storefront, and it's part of how buyers decide to buy.">
            <div className="field">
              <label htmlFor="what_selling">What are you selling?</label>
              <textarea id="what_selling" required value={form.what_selling} onChange={update('what_selling')} />
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="who_for">Who is it for?</label>
              <textarea id="who_for" required value={form.who_for} onChange={update('who_for')} />
            </div>
          </FormSection>

          <FormSection icon={FiCreditCard} title="Payouts">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="payout_ecocash_number">EcoCash number</label>
              <input id="payout_ecocash_number" value={form.payout_ecocash_number} onChange={update('payout_ecocash_number')}
                placeholder="077 123 4567" />
              <small>Where your earnings get paid out. Also required to unlock verification.</small>
            </div>
          </FormSection>

          <div style={{ marginTop: 20 }}><ThemeToggle /></div>

          {error && <p className="error-text" style={{ marginTop: 16 }}>{error}</p>}
          {saved && (
            <p style={{ color: 'var(--green-glow)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginTop: 16 }}>
              <FiCheck size={15} /> Saved.
            </p>
          )}

          <button className="btn btn--primary btn--block" disabled={submitting} type="submit" style={{ marginTop: 20 }}>
            {submitting ? 'Saving...' : 'Save changes'}
          </button>
        </form>

        <div className="form-layout__preview">
          <p className="muted" style={{ fontSize: '.8rem', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            How buyers see you
          </p>
          <div className="card card--pad">
            <div style={{
              width: 56, height: 56, borderRadius: '50%', marginBottom: 14,
              background: avatarUrl ? `url(${avatarUrl}) center/cover` : 'var(--green-dark)'
            }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <p style={{ fontWeight: 700 }}>{form.name || 'Your name'}</p>
              {!!creator.verified && <Seal />}
            </div>
            <p className="muted" style={{ fontSize: '.88rem', lineHeight: 1.5 }}>{form.bio || 'Your bio will appear here.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
