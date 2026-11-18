import { useEffect } from 'react';

// CapShield bot protection for the public auth forms. Tokens are verified server-side
// (src/middleware/capShield.js); nothing here decides whether a visitor passed.
export const CAP_SHIELD_SITE_KEY = 'ca7656de201ab286ce18';
export const CAP_SHIELD_ENDPOINT = `https://capshield.vercel.app/v1/${CAP_SHIELD_SITE_KEY}/`;

// Loads widget.js once. window.CAP_SCRIPT_NONCE is set by client/middleware.js in the HTML
// before any script runs, so the widget's browser check can run under the strict CSP.
export function useCapShieldWidget() {
  useEffect(() => {
    if (document.querySelector('script[data-capshield-widget]')) return;
    const script = document.createElement('script');
    script.src = 'https://capshield.vercel.app/widget.js';
    script.async = true;
    script.dataset.capshieldWidget = 'true';
    document.head.appendChild(script);
  }, []);
}

// The token from the widget inside this form (never another form's widget). If the visitor
// hasn't run the check yet, run it now rather than making them click it first.
export async function getCapToken(form) {
  const widget = form?.querySelector('cap-widget');
  if (!widget) return null;
  const existing = form.querySelector('input[name="cap-token"]')?.value;
  if (existing) return existing;
  if (typeof widget.solve !== 'function') return null; // widget.js not loaded yet
  try {
    const result = await widget.solve();
    return (result && result.token) || form.querySelector('input[name="cap-token"]')?.value || null;
  } catch {
    return null;
  }
}

// Tokens are single use: once the server has checked one, it can't be sent again, so after a
// failed submit the widget must start over or the next attempt is rejected as "already used".
export function resetCap(form) {
  const widget = form?.querySelector('cap-widget');
  try { widget?.reset?.(); } catch { /* widget not ready */ }
}
