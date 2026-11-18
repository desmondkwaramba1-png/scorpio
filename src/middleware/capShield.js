// CapShield server-side verification for public account creation.
// The secret is supplied only through the CAP_SHIELD_SECRET environment variable.
module.exports = async function verifyCapShield(req, res, next) {
  // Test harnesses deliberately omit the production secret; never enable this outside tests.
  if (process.env.NODE_ENV === 'test' && !process.env.CAP_SHIELD_SECRET) return next();

  const token = req.body && req.body['cap-token'];
  const secret = process.env.CAP_SHIELD_SECRET;
  if (!secret) {
    console.error('[CapShield] CAP_SHIELD_SECRET is not configured.');
    return res.status(503).json({ error: 'Security verification is temporarily unavailable. Please try again shortly.' });
  }
  if (typeof token !== 'string' || token.length < 1 || token.length > 4096) {
    return res.status(403).json({ error: 'Complete the security check and try again.' });
  }

  try {
    const response = await fetch('https://capshield.vercel.app/v1/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`verification service returned HTTP ${response.status}`);
    const result = await response.json();
    if (result && result.success === true) return next();
    return res.status(403).json({ error: 'Security verification failed. Please complete the check again.' });
  } catch (error) {
    console.error('[CapShield] Verification request failed:', error.message);
    return res.status(503).json({ error: 'Security verification is temporarily unavailable. Please try again shortly.' });
  }
};
