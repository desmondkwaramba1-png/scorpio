import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiX, FiShoppingBag, FiVolume2, FiVolumeX } from 'react-icons/fi';
import { api } from '../lib/api';
import { formatMoney } from '../lib/money';
import Seal from './Seal.jsx';

// The one thing that has to stay true here, per the brief this was built
// against: this is not a generic short-video feed. Every reel is a
// creator's own pitch, and the one element that's always fixed in place —
// never swiped away, never optional — is the "shop this" card when a
// product is attached. Autoplay, loop, and story-style tap-to-advance are
// borrowed from the format everyone already knows; the product card
// bolted onto it is the part that makes it actually belong to a
// marketplace instead of just imitating one.
export default function ReelViewer({ reels, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef(null);
  const viewedRef = useRef(new Set());

  const reel = reels[index];

  useEffect(() => {
    if (!reel) return;
    if (!viewedRef.current.has(reel.id)) {
      viewedRef.current.add(reel.id);
      api.post(`/api/reels/${reel.id}/view`).catch(() => {});
    }
  }, [reel]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, [index]);

  function next() { setIndex(i => (i + 1 < reels.length ? i + 1 : i)); }
  function prev() { setIndex(i => (i > 0 ? i - 1 : i)); }

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

  if (!reel) return null;

  return (
    <div className="reel-viewer" onClick={onClose} role="dialog" aria-modal="true" aria-label="Creator reel">
      <div className="reel-viewer__stage" onClick={e => e.stopPropagation()}>
        <div className="reel-viewer__progress">
          {reels.map((r, i) => (
            <span key={r.id} className={`reel-viewer__progress-bar${i < index ? ' is-done' : i === index ? ' is-active' : ''}`} />
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
          loop
        />

        {index > 0 && <button className="reel-viewer__tap-zone reel-viewer__tap-zone--left" onClick={prev} aria-label="Previous reel" />}
        {index < reels.length - 1 && <button className="reel-viewer__tap-zone reel-viewer__tap-zone--right" onClick={next} aria-label="Next reel" />}

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
