import { useState } from 'react';
import { getAdminKey, setAdminKey, clearAdminKey } from '../lib/adminAuth';

// Not a real login page — there's no account behind this, just the one
// shared ADMIN_KEY every /api/admin/* route has always required (see
// routes/admin.js). Kept deliberately plain so it doesn't look like more
// than it is. Shared by every /admin/blog/* page so someone landing
// directly on the editor (not through the list) gets the same gate.
function KeyPrompt({ onSubmit, error }) {
  const [value, setValue] = useState('');
  return (
    <div className="wrap" style={{ padding: '80px 20px', maxWidth: 420 }}>
      <h1 style={{ fontSize: '1.4rem', marginBottom: 8 }}>Admin key required</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        The same ADMIN_KEY every other admin action on this app already uses. Remembered on this device once entered.
      </p>
      <form onSubmit={e => { e.preventDefault(); onSubmit(value); }}>
        <div className="field">
          <input type="password" required value={value} onChange={e => setValue(e.target.value)} autoFocus placeholder="ADMIN_KEY" />
        </div>
        {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
        <button className="btn btn--primary btn--block" type="submit">Continue</button>
      </form>
    </div>
  );
}

// Render-props: children(key, onInvalidKey) — onInvalidKey clears the
// stored key and re-shows the prompt, call it from a caught 403 (the
// exact "Invalid admin key." message requireAdmin sends), never from any
// other kind of error (network, 500), which shouldn't throw away a key
// that's actually fine.
export default function AdminKeyGate({ children }) {
  const [key, setKey] = useState(() => getAdminKey());
  const [keyError, setKeyError] = useState(null);

  function handleSubmit(value) {
    setAdminKey(value);
    setKeyError(null);
    setKey(value);
  }

  function onInvalidKey() {
    clearAdminKey();
    setKey('');
    setKeyError('That key was rejected. Try again.');
  }

  if (!key) return <KeyPrompt onSubmit={handleSubmit} error={keyError} />;
  return children(key, onInvalidKey);
}
