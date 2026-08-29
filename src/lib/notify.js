// Email: real delivery via Resend once RESEND_API_KEY is set — falls back
// to a console stub otherwise, so the app never crashes on a missing key.
// WhatsApp stays a stub for now (real delivery needs a Meta Business/
// WhatsApp Cloud API setup, a separate, bigger integration).

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'SCORPIO <onboarding@resend.dev>';

async function sendEmail(to, subject, body) {
  if (!RESEND_API_KEY) {
    console.log(`[STUB EMAIL — set RESEND_API_KEY to send for real] To: ${to}\nSubject: ${subject}\n${body}\n`);
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, text: body })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`[EMAIL FAILED] To: ${to} — ${data.message || res.statusText}`);
    }
  } catch (err) {
    console.error(`[EMAIL FAILED] To: ${to} — ${err.message}`);
  }
}

function sendWhatsApp(phone, message) {
  console.log(`[STUB WHATSAPP] To: ${phone}\n${message}\n`);
}

module.exports = { sendEmail, sendWhatsApp };
