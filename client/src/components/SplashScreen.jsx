import { useEffect, useState } from 'react';
import scorpioArtwork from '../../../images/WhatsApp Image 2026-10-07 at 08.57.14.jpeg';

const SEEN_KEY = 'scorpio_splash_seen';

// A brief branded moment while the app starts, once per session. It stays short
// because it stands between someone on a slow connection and the marketplace.
export default function SplashScreen() {
  const [phase, setPhase] = useState(() => (sessionStorage.getItem(SEEN_KEY) ? 'done' : 'showing'));

  useEffect(() => {
    if (phase !== 'showing') return undefined;
    sessionStorage.setItem(SEEN_KEY, '1');
    const toFade = setTimeout(() => setPhase('leaving'), 1200);
    const toDone = setTimeout(() => setPhase('done'), 1430);
    return () => { clearTimeout(toFade); clearTimeout(toDone); };
  }, []);

  if (phase === 'done') return null;

  return (
    <div className={`splash${phase === 'leaving' ? ' splash--leaving' : ''}`} aria-hidden="true">
      <div className="splash__content">
        <img className="splash__mark" src={scorpioArtwork} alt="" />
        <p className="splash__tagline">Your ideas, out in the world.</p>
      </div>
    </div>
  );
}
