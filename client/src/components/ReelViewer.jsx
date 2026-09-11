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

// The one thing that has to stay true here, per the brief this was built
// against: this is not a generic short-video feed. Every reel is a
// creator's own pitch, and the one element that's always fixed in place ,
// never swiped away, never optional, is the "shop this" card when a
// product is attached. Autoplay, loop, and story-style tap-to-advance are
// borrowed from the format everyone already knows; the product card
// bolted onto it is the part that makes it actually belong to a
// marketplace instead of just imitating one.
export default function ReelViewer({ reels, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [countdown, setCountdown] = useState(null);
  const videoRef = useRef(null);
  const viewedRef = useRef(new Set());
  const touchStartYRef = useRef(null);
  const countdownTimerRef = useRef(null);

  const reel = reels[index];
  const isLast = index === reels.length - 1;

  useEffect(() => {
    if (!reel) return;
    if (!viewedRef.current.has(reel.id)) {
      viewedRef.current.add(reel.id);
      api.post(`/api/reels/${reel.id}/view`).catch(() => {});
    }
  }, [reel]);

  useEffect(() => {
    setProgress(0);
    setCountdown(null);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
    // Whatever reel this effect belonged to just stopped being the one on
    // screen, manual nav or not, any auto-advance countdown it started is
    // no longer valid.
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [index]);

  function next() { setIndex(i => (i + 1 < reels.length ? i + 1 : i)); }
  function prev() { setIndex(i => (i > 0 ? i - 1 : i)); }

  // A real video "ending" (not the old unconditional loop attribute) is
  // what should actually move the viewer on, the whole point of asking
  // to watch reels instead of just one. The last reel has nowhere to
  // advance TO, so it just loops in place instead of freezing on its
  // final frame.
  function handleEnded() {
    if (isLast) {
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
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
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setProgress(v.currentTime / v.duration);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Vertical swipe, the gesture this 9:16 story format actually teaches
  // people to expect, not just the left/right tap zones below. A real
  // threshold keeps an ordinary tap (still handled by those tap zones)
  // from being misread as a swipe.
  const SWIPE_THRESHOLD_PX = 50;
  function onTouchStart(e) {
    touchStartYRef.current = e.touches[0].clientY;
  }
  function onTouchEnd(e) {
    if (touchStartYRef.current === null) return;
    const delta = e.changedTouches[0].clientY - touchStartYRef.current;
    touchStartYRef.current = null;
    if (delta <= -SWIPE_THRESHOLD_PX) next();
    else if (delta >= SWIPE_THRESHOLD_PX) prev();
  }

  if (!reel) return null;

  return (
    <div className="reel-viewer" onClick={onClose} role="dialog" aria-modal="true" aria-label="Creator reel">
      <div
        className="reel-viewer__stage"
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
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

        <video
          ref={videoRef}
          key={reel.id}
          src={reel.video_path}
          className="reel-viewer__video"
          playsInline
          autoPlay
          muted={muted}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
        />

        {index > 0 && <button className="reel-viewer__tap-zone reel-viewer__tap-zone--left" onClick={prev} aria-label="Previous reel" />}
        {index < reels.length - 1 && <button className="reel-viewer__tap-zone reel-viewer__tap-zone--right" onClick={next} aria-label="Next reel" />}

        {countdown !== null && (
          <div className="reel-viewer__next-up" role="status">Next reel in {countdown}s</div>
        )}

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
    </div>
  );
}
