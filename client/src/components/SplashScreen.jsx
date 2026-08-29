import { useEffect, useRef, useState } from 'react';

const SEEN_KEY = 'scorpio_splash_seen';
const NAME = 'Scorpio';

export default function SplashScreen() {
  const [phase, setPhase] = useState(() => (sessionStorage.getItem(SEEN_KEY) ? 'done' : 'showing'));
  const pathRefs = useRef([]);
  const [ready, setReady] = useState(false);

  // Draws the scorpion stroke by stroke: each SVG path starts fully hidden
  // (dashoffset == its own length) and animates to 0, which is what makes a
  // path look hand-drawn instead of just faded in. Lengths differ per path,
  // so this has to be driven from JS (getTotalLength), not a fixed CSS value.
  useEffect(() => {
    if (phase !== 'showing') return;
    sessionStorage.setItem(SEEN_KEY, '1');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      setReady(true);
      const toFade = setTimeout(() => setPhase('leaving'), 350);
      const toDone = setTimeout(() => setPhase('done'), 700);
      return () => { clearTimeout(toFade); clearTimeout(toDone); };
    }

    pathRefs.current.forEach(el => {
      if (!el) return;
      const len = el.getTotalLength();
      el.style.strokeDasharray = String(len);
      el.style.strokeDashoffset = String(len);
    });

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        pathRefs.current.forEach((el, i) => {
          if (!el) return;
          el.style.transition = `stroke-dashoffset 900ms cubic-bezier(.3,.7,.2,1) ${i * 90}ms`;
          el.style.strokeDashoffset = '0';
        });
        setReady(true);
      });
    });

    const holdMs = 2600;
    const toFade = setTimeout(() => setPhase('leaving'), holdMs);
    const toDone = setTimeout(() => setPhase('done'), holdMs + 450);
    return () => { cancelAnimationFrame(raf); clearTimeout(toFade); clearTimeout(toDone); };
  }, [phase]);

  if (phase === 'done') return null;

  return (
    <div className={`splash${phase === 'leaving' ? ' splash--leaving' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 220 200" width="140" height="127" className={`splash__scorpion${ready ? ' is-glowing' : ''}`}>
        <g fill="none" stroke="var(--gold)" strokeLinecap="round" strokeLinejoin="round">
          {/* tail, curling from the body's rear up and over to the stinger */}
          <path ref={el => (pathRefs.current[0] = el)} strokeWidth="7"
            d="M150 150 Q160 118 138 96 Q118 78 96 84 Q70 92 74 66 Q77 46 100 40" />
          {/* body: a closed ellipse needs two 180-degree arcs — a single arc
              command with matching start/end points doesn't reliably render
              a full circle across browsers */}
          <path ref={el => (pathRefs.current[1] = el)} strokeWidth="7"
            d="M160 150 A42 26 0 1 1 76 150 A42 26 0 1 1 160 150" />
          {/* head, same two-arc technique */}
          <path ref={el => (pathRefs.current[2] = el)} strokeWidth="7"
            d="M84 146 A18 15 0 1 1 48 146 A18 15 0 1 1 84 146" />
          <path ref={el => (pathRefs.current[3] = el)} strokeWidth="6" d="M52 134 Q30 122 34 104" />
          <path ref={el => (pathRefs.current[4] = el)} strokeWidth="6" d="M54 160 Q34 168 32 188" />
          <path ref={el => (pathRefs.current[5] = el)} strokeWidth="5" d="M92 168 L80 190" />
          <path ref={el => (pathRefs.current[6] = el)} strokeWidth="5" d="M112 174 L104 198" />
          <path ref={el => (pathRefs.current[7] = el)} strokeWidth="5" d="M136 174 L140 198" />
          <path ref={el => (pathRefs.current[8] = el)} strokeWidth="5" d="M154 164 L168 182" />
        </g>
        <circle cx="100" cy="40" r="5" fill="var(--gold)" className={ready ? 'is-glowing' : ''} opacity={ready ? 1 : 0} />
      </svg>

      <p className={`splash__name${ready ? ' is-in' : ''}`}>{NAME}</p>
    </div>
  );
}
