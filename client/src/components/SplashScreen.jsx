import { useEffect, useState } from 'react';
import { FiBookOpen, FiDollarSign, FiDownload } from 'react-icons/fi';
import scorpioArtwork from '../../../images/WhatsApp Image 2026-10-07 at 08.57.14.jpeg';

const SEEN_KEY = 'scorpio_splash_seen';

const SPLASH_HIGHLIGHTS = [
  { icon: FiDownload, label: 'Instant downloads' },
  { icon: FiDollarSign, label: 'Earn from ideas' },
  { icon: FiBookOpen, label: 'Books & guides' }
];

export default function SplashScreen() {
  const [phase, setPhase] = useState(() => (sessionStorage.getItem(SEEN_KEY) ? 'done' : 'showing'));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (phase !== 'showing') return;
    sessionStorage.setItem(SEEN_KEY, '1');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      setReady(true);
      const toFade = setTimeout(() => setPhase('leaving'), 900);
      const toDone = setTimeout(() => setPhase('done'), 1200);
      return () => { clearTimeout(toFade); clearTimeout(toDone); };
    }

    const firstFrame = requestAnimationFrame(() => setReady(true));

    const holdMs = 3000;
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
          <img className="splash__mark" src={scorpioArtwork} alt="" />
        </div>
        <p className={`splash__tagline${ready ? ' is-in' : ''}`}>Your ideas, out in the world.</p>
        <div className={`splash__highlights${ready ? ' is-in' : ''}`}>
          {SPLASH_HIGHLIGHTS.map(({ icon: Icon, label }) => (
            <div className="splash__highlight" key={label}>
              <span className="splash__highlight-icon"><Icon size={17} /></span>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="splash__loading">
          <span className="splash__loading-label">Opening your marketplace</span>
          <span className="splash__loading-track"><span /></span>
        </div>
      </div>
    </div>
  );
}
