// Hand-rolled OAuth 2.0 authorization-code flow for Google and Facebook —
// no passport/auth.js dependency, just fetch. Swap or add a provider by
// adding an entry to PROVIDERS; routes/oauth.js is generic over this shape.

const PROVIDERS = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/auth/google/callback',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    async fetchProfile(accessToken) {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error('Could not fetch Google profile.');
      const data = await res.json();
      return {
        providerId: data.sub,
        email: data.email,
        emailVerified: !!data.email_verified,
        name: data.name,
        avatarUrl: data.picture
      };
    }
  },
  facebook: {
    clientId: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    redirectUri: process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:4000/api/auth/facebook/callback',
    authorizeUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    scope: 'email public_profile',
    async fetchProfile(accessToken) {
      const url = `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${encodeURIComponent(accessToken)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Could not fetch Facebook profile.');
      const data = await res.json();
      return {
        providerId: data.id,
        email: data.email || null,
        emailVerified: !!data.email,
        name: data.name,
        avatarUrl: data.picture?.data?.url || null
      };
    }
  }
};

function buildAuthorizeUrl(providerName, state) {
  const p = PROVIDERS[providerName];
  const params = new URLSearchParams({
    client_id: p.clientId || '',
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: p.scope,
    state
  });
  if (providerName === 'google') {
    params.set('access_type', 'online');
    params.set('prompt', 'select_account');
  }
  return `${p.authorizeUrl}?${params.toString()}`;
}

async function exchangeCode(providerName, code) {
  const p = PROVIDERS[providerName];
  const body = new URLSearchParams({
    client_id: p.clientId || '',
    client_secret: p.clientSecret || '',
    redirect_uri: p.redirectUri,
    code,
    grant_type: 'authorization_code'
  });
  const res = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) throw new Error(`${providerName} token exchange failed.`);
  const data = await res.json();
  return data.access_token;
}

function isConfigured(providerName) {
  const p = PROVIDERS[providerName];
  return !!(p.clientId && p.clientSecret);
}

module.exports = { PROVIDERS, buildAuthorizeUrl, exchangeCode, isConfigured };
