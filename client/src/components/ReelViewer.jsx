import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiX, FiShoppingBag, FiVolume2, FiVolumeX } from 'react-icons/fi';
import { api } from '../lib/api';
import { formatMoney } from '../lib/money';
import Seal from './Seal.jsx';

// How long the "Next reel in Ns" countdown runs before auto-advancing.
// Short on purpose — this is a scroll-y short-video format, not a
// Netflix "up next," the countdown is just enough to register that
// something's about to happen, not a real pause.
const AUTO_ADVANCE_SECONDS = 3;

function ReelSlide({ reel, index, active, muted, registerSlideRef, registerVideoRef, onEnded, onTimeUpdate, onClose }) {
  return (
    <div
      ref={el => registerSlideRef(index, el)}
      data-index={index}
      className="reel-viewer__slide"
    >
      <video
        ref={el => registerVideoRef(index, el)}
        src={reel.video_path}
        className="reel-viewer__video"
        playsInline
        muted={muted}
        preload={active ? 'auto' : 'none'}
        onEnded={active ? onEnded : undefined}
        onTimeUpdate={active ? onTimeUpdate : undefined}
      />

      <div className="reel-viewer__overlay">
        <Link to={`/@${reel.creator_handle}`} className="reel-viewer__creator" onClick={onClose}>
          <span
            className="reel-viewer__creator-avatar"
            style={{ background: reel.creator_avatar ? `url(${reel.creator_avatar}) center/cover` : 'var(--gold)' }}
          />
          <span>{reel.creator_name}</span>
          {!!reel.creator_verified && <Seal />}
        </Link>
        {reel.caption && <p className="reel-viewer__caption">{reel.caption}</p>}
      </div>

      {reel.product_slug && (
        <Link to={`/@${reel.creator_handle}/${reel.product_slug}`} className="reel-viewer__shop" onClick={onClose}>
          <span
            className="reel-viewer__shop-cover"
            style={reel.product_cover ? { backgroundImage: `url(${reel.product_cover})` } : undefined}
          />
          <span className="reel-viewer__shop-info">
            <span className="reel-viewer__shop-title">{reel.product_title}</span>
            <span className="mono reel-viewer__shop-price">{formatMoney(reel.price_minor, reel.currency)}</span>
          </span>
          <span className="reel-viewer__shop-cta"><FiShoppingBag size={14} /> Shop this</span>
        </Link>
      )}
    </div>
  );
}

// The one thing that has to stay true here, per the brief this was built
// against: this is not a generic short-video feed. Every reel is a
// creator's own pitch, and the one element that's always fixed in place ,
// never swiped away, never optional, is the "shop this" card when a
// product is attached. Autoplay, loop, and story-style tap-to-advance are
// borrowed from the format everyone already knows; the product card
// bolted onto it is the part that makes it actually belong to a
// marketplace instead of just imitating one.
//
// A real vertically-scrolling feed, not a swipe-triggered hard cut —
// every reel gets its own slide, stacked in a scroll-snap container, and
// an IntersectionObserver (not scroll-position math) decides which one is
// "active," the same signal whether a finger scrolled it, a mouse wheel
// did, or next()/prev() called scrollIntoView() programmatically. Only
// the active slide's video plays; every other one is paused, so nothing
// keeps eating bandwidth or making noise off-screen.
export default function ReelViewer({ reels, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [countdown, setCountdown] = useState(null);
  const containerRef = useRef(null);
  const slideRefs = useRef([]);
  const videoRefs = useRef([]);
  const viewedRef = useRef(new Set());
  const countdownTimerRef = useRef(null);

  const reel = reels[index];
  const isLast = index === reels.length - 1;

  function registerSlideRef(i, el) { slideRefs.current[i] = el; }
  function registerVideoRef(i, el) { videoRefs.current[i] = el; }

  // Jump to the requested starting reel instantly, before the observer
  // below has a chance to see the container at its default scroll
  // position (0) and briefly report the wrong reel as active.
  useEffect(() => {
    const el = slideRefs.current[startIndex];
    if (el) el.scrollIntoView({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          setIndex(Number(entry.target.dataset.index));
        }
      }
    }, { root, threshold: 0.5 });
    slideRefs.current.forEach(s => s && observer.observe(s));
    return () => observer.disconnect();
  }, [reels.length]);

  useEffect(() => {
    if (!reel) return;
    if (!viewedRef.current.has(reel.id)) {
      viewedRef.current.add(reel.id);
      api.post(`/api/reels/${reel.id}/view`).catch(() => {});
    }
  }, [reel]);

  // Play whichever slide just became active, pause every other one —
  // videoRefs holds every slide's <video>, not just the active one.
  useEffect(() => {
    setProgress(0);
    setCountdown(null);
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === index) {
        v.currentTime = 0;
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [index]);

  function goTo(i) {
    const clamped = Math.max(0, Math.min(i, reels.length - 1));
    slideRefs.current[clamped]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function next() { goTo(index + 1); }
  function prev() { goTo(index - 1); }

  // A real video "ending" is what actually moves the viewer on, the whole
  // point of asking to watch reels instead of just one. The last reel has
  // nowhere to scroll TO, so it just loops in place instead of freezing
  // on its final frame.
  function handleEnded() {
    if (isLast) {
      const v = videoRefs.current[index];
      if (v) {
        v.currentTime = 0;
        v.play().catch(() => {});
      }
      return;
    }
    let remaining = AUTO_ADVANCE_SECONDS;
    setCountdown(remaining);
    countdownTimerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        next();
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }

  function handleTimeUpdate() {
    const v = videoRefs.current[index];
    if (!v || !v.duration) return;
    setProgress(v.currentTime / v.duration);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') prev();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (!reel) return null;

  return (
    <div className="reel-viewer" onClick={onClose} role="dialog" aria-modal="true" aria-label="Creator reels">
      <div className="reel-viewer__stage" onClick={e => e.stopPropagation()}>
        <div className="reel-viewer__progress">
          {reels.map((r, i) => (
            <span key={r.id} className={`reel-viewer__progress-bar${i < index ? ' is-done' : ''}`}>
              {i === index && (
                <span className="reel-viewer__progress-fill" style={{ transform: `scaleX(${progress})` }} />
              )}
            </span>
          ))}
        </div>

        <button className="reel-viewer__close" onClick={onClose} aria-label="Close"><FiX size={20} /></button>
        <button className="reel-viewer__mute" onClick={() => setMuted(m => !m)} aria-label={muted ? 'Unmute' : 'Mute'}>
          {muted ? <FiVolumeX size={16} /> : <FiVolume2 size={16} />}
        </button>

        {countdown !== null && (
          <div className="reel-viewer__next-up" role="status">Next reel in {countdown}s</div>
        )}

        <div className="reel-viewer__feed" ref={containerRef}>
          {reels.map((r, i) => (
            <ReelSlide
              key={r.id}
              reel={r}
              index={i}
              active={i === index}
              muted={muted}
              registerSlideRef={registerSlideRef}
              registerVideoRef={registerVideoRef}
              onEnded={handleEnded}
              onTimeUpdate={handleTimeUpdate}
              onClose={onClose}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
