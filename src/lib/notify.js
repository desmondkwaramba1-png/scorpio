// Email: real delivery via Resend once RESEND_API_KEY is set — falls back
// to a console stub otherwise, so the app never crashes on a missing key.
// (WhatsApp notifications were removed — they were a stub that only ever
// logged to the console, never actually sent anything. The wa.me contact-
// seller links elsewhere in the app are unrelated and stay: those are
// plain deep links the buyer's own browser opens, no API or stub involved.)

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'SCORPIO <onboarding@resend.dev>';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Every email on the platform goes through this one function, so this is
// the only place branding lives — every call site just passes a plain
// subject/body string (unchanged from before this existed) and gets a
// real branded HTML email out the other end, not a bare wall of text.
// The FIRST link found in the body becomes a styled button (the one
// action every one of these emails actually has — verify, reset, view an
// order); the plain URL still prints underneath it, since some inboxes
// strip button styling and a dead-looking button with no fallback is
// worse than no button at all.
function renderHtml(subject, body) {
  const urlMatch = body.match(/https?:\/\/\S+/);
  const ctaUrl = urlMatch ? urlMatch[0].replace(/[.,)]+$/, '') : null;

  const buttonHtml = ctaUrl ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
      <tr><td style="border-radius:999px;background:#FF8C42;">
        <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:13px 28px;color:#131921;font-weight:700;font-size:15px;text-decoration:none;border-radius:999px;">
          Continue
        </a>
      </td></tr>
    </table>
    <p style="margin:0 0 16px;color:#565959;font-size:13px;word-break:break-all;">
      Or paste this link into your browser:<br>
      <a href="${escapeHtml(ctaUrl)}" style="color:#C93659;">${escapeHtml(ctaUrl)}</a>
    </p>` : '';

  // The button renders right where the link actually was in the original
  // text, not always tacked on at the very end — a body with the link
  // mid-message (paragraph, then link, then more text) otherwise left an
  // orphaned line above the button with an unrelated paragraph awkwardly
  // wedged between them.
  let buttonPlaced = false;
  const content = body
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const hasUrl = ctaUrl && block.includes(ctaUrl);
      // The URL itself becomes the button, not printed twice inline — but
      // a block like "Reset your password: <url>" has real lead-in text
      // worth keeping. Strip just the URL substring (plus a trailing
      // colon it's commonly attached to); only drop the block entirely if
      // nothing but whitespace is left, which is the bare-link case.
      let text = hasUrl ? block.replace(ctaUrl, '').replace(/:\s*$/, '').trim() : block;
      const p = text ? `<p style="margin:0 0 16px;color:#3D4852;font-size:15px;line-height:1.6;">${escapeHtml(text).replace(/\n/g, '<br>')}</p>` : '';
      if (hasUrl) { buttonPlaced = true; return p + buttonHtml; }
      return p;
    })
    .filter(Boolean)
    .join('')
    + (ctaUrl && !buttonPlaced ? buttonHtml : ''); // link block had nothing else on it and got fully dropped above — still show the button

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#F0F2F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F0F2F2;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:480px;">
        <tr><td style="padding-bottom:20px;text-align:center;">
          <span style="font-family:Georgia,serif;font-style:italic;font-size:32px;color:#FF8C42;">Scorpio</span>
        </td></tr>
        <tr><td style="background:#FFFFFF;border-radius:14px;padding:32px 28px;box-shadow:0 1px 2px rgba(19,25,33,.06);">
          <h1 style="margin:0 0 16px;color:#0F1111;font-size:20px;line-height:1.35;">${escapeHtml(subject)}</h1>
          ${content}
        </td></tr>
        <tr><td style="padding:20px 8px 0;text-align:center;color:#565959;font-size:12px;">
          SCORPIO &middot; Built for Zimbabwe. Pay with EcoCash.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendEmail(to, subject, body) {
  if (!RESEND_API_KEY) {
    console.log(`[STUB EMAIL — set RESEND_API_KEY to send for real] To: ${to}\nSubject: ${subject}\n${body}\n`);
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, text: body, html: renderHtml(subject, body) })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`[EMAIL FAILED] To: ${to} — ${data.message || res.statusText}`);
    }
  } catch (err) {
    console.error(`[EMAIL FAILED] To: ${to} — ${err.message}`);
  }
}

module.exports = { sendEmail };
