import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [creator, setCreator] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
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

  useEffect(() => { refresh(); }, [refresh]);

  async function logout() {
    try {
      await api.post('/api/auth/logout');
    } catch (err) {
      console.error('[auth] server logout failed; clearing local session', err);
    } finally {
      setUser(null);
      setCreator(null);
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
