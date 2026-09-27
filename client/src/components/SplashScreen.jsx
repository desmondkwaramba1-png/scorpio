import { useEffect, useState } from 'react';

const SEEN_KEY = 'scorpio_splash_seen';

export default function SplashScreen() {
  const [phase, setPhase] = useState(() => (sessionStorage.getItem(SEEN_KEY) ? 'done' : 'showing'));

  useEffect(() => {
    if (phase !== 'showing') return;
    sessionStorage.setItem(SEEN_KEY, '1');
    const toFade = setTimeout(() => setPhase('leaving'), 260);
    const toDone = setTimeout(() => setPhase('done'), 460);
    return () => { clearTimeout(toFade); clearTimeout(toDone); };
  }, []);

  if (phase === 'done') return null;

  return (
    <div className={`splash${phase === 'leaving' ? ' splash--leaving' : ''}`} role="status" aria-live="polite">
      <div className="splash__mark" aria-hidden="true"><span /><span /><span /></div>
      <p className="splash__name">Opening SCORPIO</p>
      <p className="splash__message">Getting the marketplace ready for you...</p>
    </div>
  );
}
