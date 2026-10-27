import { useEffect } from 'react';

// Closing the tab or reloading mid-upload throws the upload away. While
// `active`, ask the browser to confirm before that happens.
export default function useLeaveGuard(active) {
  useEffect(() => {
    if (!active) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
}
