import { useEffect, useRef, useState } from 'react';
import { FiBookOpen, FiFileText, FiPlayCircle } from 'react-icons/fi';

const SEEN_KEY = 'scorpio_splash_seen';
const NAME = 'Scorpio';

const FLOATERS = [
  { Icon: FiBookOpen, label: 'Guides', position: 'guides', size: 16, duration: 4.8, delay: 0 },
  { Icon: FiFileText, label: 'Templates', position: 'templates', size: 16, duration: 5.4, delay: 0.25 },
  { Icon: FiPlayCircle, label: 'Courses', position: 'courses', size: 16, duration: 5.1, delay: 0.5 },
];

export default function SplashScreen() {
  const [phase, setPhase] = useState(() => (sessionStorage.getItem(SEEN_KEY) ? 'done' : 'showing'));
  const pathRefs = useRef([]);
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

    pathRefs.current.forEach(el => {
      if (!el) return;
      const length = el.getTotalLength();
      el.style.strokeDasharray = String(length);
      el.style.strokeDashoffset = String(length);
    });

    const firstFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        pathRefs.current.forEach((el, index) => {
          if (!el) return;
          el.style.transition = `stroke-dashoffset 500ms cubic-bezier(.3,.7,.2,1) ${index * 50}ms`;
          el.style.strokeDashoffset = '0';
        });
        setReady(true);
      });
    });

    const holdMs = 1150;
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
        <div className="splash__scene">
          {FLOATERS.map(({ Icon, label, position, size, duration, delay }) => (
            <span
              key={label}
              className={`splash__tile splash__tile--${position}`}
              style={{ animationDuration: `${duration}s`, animationDelay: `${delay}s` }}
            >
              <Icon size={size} />
              <span>{label}</span>
            </span>
          ))}

          <svg viewBox="0 0 220 200" className={`splash__scorpion${ready ? ' is-glowing' : ''}`}>
            <g fill="none" stroke="var(--gold)" strokeLinecap="round" strokeLinejoin="round">
              <path ref={el => (pathRefs.current[0] = el)} strokeWidth="7" d="M150 150 Q160 118 138 96 Q118 78 96 84 Q70 92 74 66 Q77 46 100 40" />
              <path ref={el => (pathRefs.current[1] = el)} strokeWidth="7" d="M160 150 A42 26 0 1 1 76 150 A42 26 0 1 1 160 150" />
              <path ref={el => (pathRefs.current[2] = el)} strokeWidth="7" d="M84 146 A18 15 0 1 1 48 146 A18 15 0 1 1 84 146" />
              <path ref={el => (pathRefs.current[3] = el)} strokeWidth="6" d="M52 134 Q30 122 34 104" />
              <path ref={el => (pathRefs.current[4] = el)} strokeWidth="6" d="M54 160 Q34 168 32 188" />
              <path ref={el => (pathRefs.current[5] = el)} strokeWidth="5" d="M92 168 L80 190" />
              <path ref={el => (pathRefs.current[6] = el)} strokeWidth="5" d="M112 174 L104 198" />
              <path ref={el => (pathRefs.current[7] = el)} strokeWidth="5" d="M136 174 L140 198" />
              <path ref={el => (pathRefs.current[8] = el)} strokeWidth="5" d="M154 164 L168 182" />
            </g>
            <circle cx="100" cy="40" r="5" fill="var(--green)" opacity={ready ? 1 : 0} />
          </svg>
        </div>
        <p className={`splash__name${ready ? ' is-in' : ''}`}>{NAME}</p>
        <p className="splash__tagline">Ideas worth sharing.</p>
        <div className="splash__loading">
          <span className="splash__loading-label">Opening your marketplace</span>
          <span className="splash__loading-track"><span /></span>
        </div>
      </div>
    </div>
  );
}
