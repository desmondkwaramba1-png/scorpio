import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [creator, setCreator] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (knownData = null) => {
    if (knownData?.user) {
      setUser(knownData.user);
      setCreator(knownData.creator || null);
      setLoading(false);
      return knownData;
    }
    try {
      const data = await api.get('/api/auth/me');
      setUser(data.user);
      setCreator(data.creator);
      return data;
    } catch {
      setUser(null);
      setCreator(null);
      return { user: null, creator: null };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    api.warmup().catch(() => {});
  }, [refresh]);

  // A session that ended mid-visit should lead to the login page, which brings
  // the person back here, not leave them with confusing errors on a dead page.
  useEffect(() => {
    const onExpired = () => { setUser(null); setCreator(null); };
    window.addEventListener('scorpio:session-expired', onExpired);
    return () => window.removeEventListener('scorpio:session-expired', onExpired);
  }, []);

  async function logout() {
    try {
      await api.post('/api/auth/logout');
    } catch (err) {
      console.error('[auth] server logout failed; clearing local session', err);
    } finally {
      setUser(null);
      setCreator(null);
      // Nothing from this person's session may stay on a shared phone.
      if ('caches' in window) await caches.delete('api-reads').catch(() => {});
    }
  }

  return (
    <AuthContext.Provider value={{ user, creator, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
