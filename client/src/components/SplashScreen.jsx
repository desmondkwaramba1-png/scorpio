import { useEffect, useRef, useState } from 'react';
import { FiBookOpen, FiFileText, FiPlayCircle } from 'react-icons/fi';

const SEEN_KEY = 'scorpio_splash_seen';
const NAME = 'Scorpio';

// Small ambient marks for what's actually on the marketplace, a book, a
// template/guide page, a course play button, plus a tiny scorpion
// silhouette, each gently floating in a fixed spot. Positioned to frame
// the mark rather than crowd it: nothing sits within ~35% of center.
const FLOATERS = [
  { Icon: FiBookOpen, top: '20%', left: '14%', size: 22, duration: 6, delay: 0 },
  { Icon: FiFileText, top: '74%', left: '18%', size: 18, duration: 7, delay: .9 },
  { Icon: FiPlayCircle, top: '24%', left: '84%', size: 24, duration: 6.5, delay: .4 },
  { Icon: 'scorpion', top: '76%', left: '82%', size: 20, duration: 7.5, delay: 1.3 }
];

// A simplified, single-path silhouette (not the full multi-stroke hero
// mark), plenty of detail at 20px, and cheap to render several times
// over as a small ambient icon.
function MiniScorpion({ size }) {
  return (
    <svg viewBox="0 0 220 200" width={size} height={size * (200 / 220)} fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round">
      <path d="M150 150 Q160 118 138 96 Q118 78 96 84 Q70 92 74 66 Q77 46 100 40" />
      <path d="M160 150 A42 26 0 1 1 76 150 A42 26 0 1 1 160 150" />
      <path d="M84 146 A18 15 0 1 1 48 146 A18 15 0 1 1 84 146" />
    </svg>
  );
}

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
      const toFade = setTimeout(() => setPhase('leaving'), 250);
      const toDone = setTimeout(() => setPhase('done'), 500);
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
          // 500ms/50ms, not 900ms/90ms - the hand-drawn effect is the
          // point, but a splash screen someone sees on literally every
          // first visit shouldn't take 1.6s just to finish drawing before
          // it's even allowed to start fading. Last path (i=8) now
          // finishes at 8*50+500=900ms instead of 1620ms. The CSS delays
          // on .splash__name and .splash__scorpion.is-glowing are tuned
          // to this same ~900ms mark, see index.css.
          el.style.transition = `stroke-dashoffset 500ms cubic-bezier(.3,.7,.2,1) ${i * 50}ms`;
          el.style.strokeDashoffset = '0';
        });
        setReady(true);
      });
    });

    // 1150ms hold (just past the ~900ms mark - both the scorpion's draw
    // and the name/glow fade-in finish right around then, see index.css -
    // a brief beat to actually register the finished mark) + 300ms fade
    // = 1.45s total, down from 3.05s.
    const holdMs = 1150;
    const toFade = setTimeout(() => setPhase('leaving'), holdMs);
    const toDone = setTimeout(() => setPhase('done'), holdMs + 300);
    return () => { cancelAnimationFrame(raf); clearTimeout(toFade); clearTimeout(toDone); };
    // Deliberately [] not [phase]: this effect's own job is to walk
    // 'showing' -> 'leaving' -> 'done' via its own two timers. Depending
    // on [phase] made it re-run the moment toFade's callback set phase to
    // 'leaving' — and re-running fired this same cleanup *first*, which
    // clearTimeout'd toDone before it ever got to fire. Real, confirmed
    // bug: phase got stuck at 'leaving' forever (verified via computed
    // styles - opacity:0, pointer-events:none, so invisible and harmless,
    // but the node never actually unmounted like `if (phase === 'done')
    // return null` above intends). Empty deps: run these timers exactly
    // once per real mount, let them both fire on schedule.
  }, []);

  if (phase === 'done') return null;

  return (
    <div className={`splash${phase === 'leaving' ? ' splash--leaving' : ''}`} aria-hidden="true">
      {FLOATERS.map((f, i) => (
        <span
          key={i} className="splash__floater"
          style={{ top: f.top, left: f.left, animationDuration: `${f.duration}s`, animationDelay: `${f.delay}s` }}
        >
          {f.Icon === 'scorpion' ? <MiniScorpion size={f.size} /> : <f.Icon size={f.size} />}
        </span>
      ))}

      <svg viewBox="0 0 220 200" width="140" height="127" className={`splash__scorpion${ready ? ' is-glowing' : ''}`}>
        <g fill="none" stroke="var(--green-dark)" strokeLinecap="round" strokeLinejoin="round">
          {/* tail, curling from the body's rear up and over to the stinger */}
          <path ref={el => (pathRefs.current[0] = el)} strokeWidth="7"
            d="M150 150 Q160 118 138 96 Q118 78 96 84 Q70 92 74 66 Q77 46 100 40" />
          {/* body: a closed ellipse needs two 180-degree arcs, a single arc
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
