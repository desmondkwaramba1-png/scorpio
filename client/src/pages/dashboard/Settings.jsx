import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { FiUser, FiCheck, FiCamera, FiCompass } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../lib/api';
import Seal from '../../components/Seal.jsx';
import ImageCropper from '../../components/ImageCropper.jsx';
import ThemeToggle from '../../components/ThemeToggle.jsx';

export default function Settings() {
  const { user, creator, refresh } = useAuth();

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

  function restartGuide() {
    localStorage.removeItem('scorpio_tour_completed');
    window.location.assign('/dashboard');
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: 4 }}>Settings</h1>
      <p className="muted" style={{ marginBottom: 28 }}>Your account, your storefront, and where your money goes.</p>
      <button type="button" className="btn btn--ghost btn--sm" onClick={restartGuide} style={{ marginBottom: 24 }}>
        <FiCompass size={14} /> Restart dashboard guide
      </button>

      <div className="form-layout">
        <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
          {/* Real settings pages lead with who you actually are (username,
              email, phone) before anything about how your storefront
              looks - this app had nowhere at all showing that, Settings
              jumped straight into public-facing profile fields as if
              "account" and "storefront" were the same thing. Read-only
              for now (no change-password/change-email flow exists yet),
              but at least visible, which is what most of "doesn't feel
              like a settings page" actually meant. */}
          <div className="settings-group">
            <p className="settings-group__label">Account</p>
            <div className="settings-card">
              <div className="settings-row">
                <span className="settings-row__label">Username</span>
                <span className="settings-row__value">{user?.username}</span>
              </div>
              <div className="settings-row">
                <span className="settings-row__label">Email</span>
                <span className="settings-row__value" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {user?.email}
                  <span className={`badge ${user?.email_verified_at ? 'badge--green' : 'badge--neutral'}`} style={{ fontSize: '.68rem' }}>
                    {user?.email_verified_at ? 'Verified' : 'Unverified'}
                  </span>
                </span>
              </div>
              <div className="settings-row">
                <span className="settings-row__label">Phone</span>
                <span className="settings-row__value">{user?.phone}</span>
              </div>
            </div>
          </div>

          <div className="settings-group">
            <p className="settings-group__label">Storefront profile</p>
            <div className="settings-card">
              <div className="settings-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <label htmlFor="avatar" style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
                    <input id="avatar" type="file" accept="image/*" onChange={handleAvatar}
                      style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0 }} />
                    <div style={{
                      width: 56, height: 56, borderRadius: '50%',
                      background: avatarUrl ? `url(${avatarUrl}) center/cover` : 'var(--green-tint)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green-glow)'
                    }}>
                      {!avatarUrl && <FiUser size={24} />}
                    </div>
                    <div style={{
                      position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: '50%',
                      background: 'var(--gold)', color: 'var(--green-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '2px solid var(--surface)'
                    }}>
                      <FiCamera size={10} />
                    </div>
                  </label>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '.9rem' }}>Profile photo</p>
                    <label htmlFor="avatar" className="muted" style={{ fontSize: '.82rem', fontWeight: 600, cursor: 'pointer', color: 'var(--green-glow)' }}>
                      {avatar ? 'Photo updated, save to apply' : (creator.avatar_path ? 'Change photo' : 'Choose a photo')}
                    </label>
                  </div>
                </div>
              </div>

              {cropping && (
                <div className="settings-row settings-row--stacked">
                  <ImageCropper
                    file={cropping} aspect={1} round
                    onCancel={() => setCropping(null)}
                    onApply={applyAvatarCrop}
                  />
                </div>
              )}

              <div className="settings-row settings-row--stacked">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="name">Your name</label>
                  <input id="name" required value={form.name} onChange={update('name')} />
                </div>
              </div>

              <div className="settings-row settings-row--stacked">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="bio">A short bio</label>
                  <textarea id="bio" value={form.bio} onChange={update('bio')} placeholder="A line or two about who you are." />
                </div>
              </div>
            </div>
          </div>

          <div className="settings-group">
            <p className="settings-group__label">Why buyers should trust you</p>
            <div className="settings-card">
              <div className="settings-row settings-row--stacked">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="what_selling">What are you selling?</label>
                  <textarea id="what_selling" required value={form.what_selling} onChange={update('what_selling')} />
                </div>
              </div>
              <div className="settings-row settings-row--stacked">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="who_for">Who is it for?</label>
                  <textarea id="who_for" required value={form.who_for} onChange={update('who_for')} />
                </div>
              </div>
            </div>
          </div>

          <div className="settings-group">
            <p className="settings-group__label">Payouts</p>
            <div className="settings-card">
              <div className="settings-row settings-row--stacked">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="payout_ecocash_number">EcoCash number</label>
                  <input id="payout_ecocash_number" value={form.payout_ecocash_number} onChange={update('payout_ecocash_number')}
                    placeholder="077 123 4567" />
                  <small>Where your earnings get paid out. Also required to unlock verification.</small>
                </div>
              </div>
            </div>
          </div>

          {/* ThemeToggle is already its own self-contained card (icon,
              label, description, action button) shared with Account.jsx's
              buyer-facing settings - nesting it inside another card/row
              here would just double up the box-in-a-box look instead of
              matching it. */}
          <div className="settings-group">
            <p className="settings-group__label">Appearance</p>
            <ThemeToggle />
          </div>

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
            {/* Matches the upload control's own no-avatar state just
                above (FiUser on --green-tint) - this preview used to be a
                plain blank circle with no fallback content at all when no
                avatar was set, inconsistent with its own sibling control
                a few lines up in this same file. */}
            <div style={{
              width: 56, height: 56, borderRadius: '50%', marginBottom: 14,
              background: avatarUrl ? `url(${avatarUrl}) center/cover` : 'var(--green-tint)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green-glow)'
            }}>
              {!avatarUrl && <FiUser size={22} />}
            </div>
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
