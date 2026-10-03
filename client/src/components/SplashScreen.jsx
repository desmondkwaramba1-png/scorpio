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
  }, [phase]);

  if (phase === 'done') return null;

  return (
    <div className={`splash${phase === 'leaving' ? ' splash--leaving' : ''}`} role="status" aria-live="polite">
      <svg
        className={`splash__scorpion ${phase === 'showing' ? 'is-glowing' : ''}`}
        width="120"
        height="120"
        viewBox="0 0 120 120"
        aria-label="SCORPIO"
        role="img"
      >
        <path d="M60 18c-11 0-20 9-20 20 0 9 6 16 14 19v8l-8 10-10-9-9 5 11 11 8-6 6 16 12-12 13 12 7-16 8 6 12-11-9-5-10 9-8-10v-8c8-3 14-10 14-19 0-11-9-20-20-20zm8 22c0 4-3 7-8 7s-8-3-8-7 3-7 8-7 8 3 8 7zm-17 30l-7 18 12-6 12 6-7-18-10 0zm20 0l10 0-7 18 12-6 12 6-7-18h-20z" fill="currentColor" />
        <circle cx="60" cy="38" r="6" fill="#131921" opacity="0.25"/>
      </svg>
      <p className="splash__name">SCORPIO</p>
      <p className="splash__message">Getting the marketplace ready for you...</p>
    </div>
  );
}
