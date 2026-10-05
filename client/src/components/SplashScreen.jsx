import { useEffect, useState } from 'react';

const SEEN_KEY = 'scorpio_splash_seen';

export default function SplashScreen() {
  const [phase, setPhase] = useState(() => (sessionStorage.getItem(SEEN_KEY) ? 'done' : 'showing'));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (phase !== 'showing') return;
    sessionStorage.setItem(SEEN_KEY, '1');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      setReady(true);
      const toFade = setTimeout(() => setPhase('leaving'), 250);
      const toDone = setTimeout(() => setPhase('done'), 550);
      return () => { clearTimeout(toFade); clearTimeout(toDone); };
    }

    const firstFrame = requestAnimationFrame(() => setReady(true));

    const holdMs = 1350;
    const toFade = setTimeout(() => setPhase('leaving'), holdMs);
    const toDone = setTimeout(() => setPhase('done'), holdMs + 300);
    return () => {
      cancelAnimationFrame(firstFrame);
      clearTimeout(toFade);
      clearTimeout(toDone);
    };
  }, []);

  if (phase === 'done') return null;

  return (
    <div className={`splash${phase === 'leaving' ? ' splash--leaving' : ''}`} aria-hidden="true">
      <div className="splash__content">
        <p className="splash__eyebrow mono">ZIMBABWE'S CREATOR MARKETPLACE</p>
        <div className={`splash__stage${ready ? ' is-in' : ''}`} aria-hidden="true">
          <img className="splash__mark" src="/brand/splash-scorpion.svg" alt="" />
        </div>
        <h1 className={`splash__name${ready ? ' is-in' : ''}`}>SCORPIO</h1>
        <p className="splash__tagline">Your ideas, out in the world.</p>
        <div className="splash__loading">
          <span className="splash__loading-label">Opening your marketplace</span>
          <span className="splash__loading-track"><span /></span>
        </div>
      </div>
    </div>
  );
}
