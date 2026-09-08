import { createContext, useContext, useCallback, useState } from 'react';

const AdminContext = createContext(null);
const STORAGE_KEY = 'scorpio_admin_key';

// No admin login/account system exists (see admin.js on the backend) — the
// whole access model is "know the shared ADMIN_KEY or you don't get in."
// sessionStorage, not localStorage, so a key typed on a shared/public
// machine doesn't linger past that browser session.
export function AdminProvider({ children }) {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(STORAGE_KEY));

  const setKey = useCallback((key) => {
    sessionStorage.setItem(STORAGE_KEY, key);
    setAdminKey(key);
  }, []);

  const clearKey = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setAdminKey(null);
  }, []);

  // Every admin call needs the same header and the same "wrong/expired key"
  // handling (drop it and force re-entry) — centralized here so each admin
  // page just calls adminFetch(path) instead of repeating that logic.
  const adminFetch = useCallback(async (path) => {
    const res = await fetch(path, { headers: { 'X-Admin-Key': adminKey || '' } });
    if (res.status === 403 || res.status === 501) {
      clearKey();
      throw new Error(res.status === 501 ? 'ADMIN_KEY is not set on the server.' : 'Invalid admin key.');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'Request failed.');
    return data;
  }, [adminKey, clearKey]);

  const adminPost = useCallback(async (path, body) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey || '' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 403 || res.status === 501) {
      clearKey();
      throw new Error(res.status === 501 ? 'ADMIN_KEY is not set on the server.' : 'Invalid admin key.');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'Request failed.');
    return data;
  }, [adminKey, clearKey]);

  return (
    <AdminContext.Provider value={{ adminKey, setKey, clearKey, adminFetch, adminPost }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  return useContext(AdminContext);
}
