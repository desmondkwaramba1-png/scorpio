// CapShield server-side verification for public auth endpoints.
// The secret is supplied only through the CAP_SHIELD_SECRET environment variable.
//
// Fails closed: a request continues only when siteverify answers HTTP 200 with success: true.
// How each siteverify answer is mapped (see https://capshield.vercel.app/docs):
//   200 success:true                       -> continue
//   200 success:false (blocked_by_policy)  -> 403, the visitor was refused by a site rule
//   404 token not found / already used     -> 403, the visitor must complete the check again
//   403 token expired                      -> 403, the visitor must complete the check again
//   403 invalid site key or secret         -> 503, our configuration is wrong (logged, not the visitor's fault)
//   400 malformed token                    -> 403
//   5xx, timeout, network error            -> 503, temporarily unavailable
const SITEVERIFY_URL = 'https://capshield.vercel.app/v1/siteverify';
const RETRY = 'Security verification failed. Please complete the check again.';
const UNAVAILABLE = 'Security verification is temporarily unavailable. Please try again shortly.';

module.exports = async function verifyCapShield(req, res, next) {
  // Test harnesses deliberately omit the production secret; never enable this outside tests.
  if (process.env.NODE_ENV === 'test' && !process.env.CAP_SHIELD_SECRET) return next();

  const token = req.body && req.body['cap-token'];
  const secret = process.env.CAP_SHIELD_SECRET;
  if (!secret) {
    console.error('[CapShield] CAP_SHIELD_SECRET is not configured.');
    return res.status(503).json({ error: UNAVAILABLE });
  }
  if (typeof token !== 'string' || token.length < 1 || token.length > 4096) {
    return res.status(403).json({ error: 'Complete the security check and try again.' });
  }

  let response;
  let result = null;
  try {
    response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
      signal: AbortSignal.timeout(5000)
    });
    result = await response.json().catch(() => null);
  } catch (error) {
    console.error('[CapShield] Verification request failed:', error.message);
    return res.status(503).json({ error: UNAVAILABLE });
  }

  if (response.status === 200 && result && result.success === true) return next();

  const reason = (result && typeof result.error === 'string' && result.error.slice(0, 80)) || `HTTP ${response.status}`;
  if (response.status >= 500 || (response.status === 200 && !result)) {
    console.error('[CapShield] Verification service error:', reason);
    return res.status(503).json({ error: UNAVAILABLE });
  }
  if (response.status === 403 && /secret|site key/i.test(reason)) {
    console.error('[CapShield] Siteverify rejected our site secret. Check CAP_SHIELD_SECRET.');
    return res.status(503).json({ error: UNAVAILABLE });
  }
  // 200 success:false, 400, 403 expired, 404 unknown/used: the token is not good. Never accept it.
  console.warn('[CapShield] Token rejected:', reason);
  return res.status(403).json({ error: RETRY, code: 'captcha_failed' });
};
