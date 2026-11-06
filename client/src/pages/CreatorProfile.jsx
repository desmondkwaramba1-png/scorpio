import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FiChevronRight, FiX } from 'react-icons/fi';
import Seal from '../components/Seal.jsx';
import { Stars } from '../components/ReviewsSection.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSEO } from '../lib/seo';
import { SITE_HOST, SITE_ORIGIN } from '../lib/site.js';

export default function CreatorProfile() {
  const { handle: rawHandle } = useParams();
  // The route is "/:handle" (not "/@:handle", React Router won't match a
  // literal prefix fused with a param in one segment), so the captured
  // value still has the leading "@" from the URL. Strip it before using it
  // as the actual handle anywhere.
  const handle = rawHandle.replace(/^@/, '');
  const { creator: myCreator } = useAuth();
  const [creator, setCreator] = useState(null);
  const [error, setError] = useState(null);
  const [reels, setReels] = useState(null);
  const [avatarOpen, setAvatarOpen] = useState(false);

  useEffect(() => {
    setCreator(null);
    setError(null);
    setReels(null);
    setAvatarOpen(false);
    fetch(`/api/creators/${handle}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setCreator)
      .catch(() => setError('This creator could not be found.'));
    fetch(`/api/reels?creator=${handle}`).then(r => r.json()).then(setReels).catch(() => setReels([]));
  }, [handle]);

  // Escape closes the same way clicking the backdrop or the close button
  // does — only wired up while the lightbox is actually open, so it's not
  // one more global listener sitting around on every product-browsing
  // page load.
  useEffect(() => {
    if (!avatarOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setAvatarOpen(false); };
    window.addEventListener('keydown', onKey);
    // Unlike .splash/.reel-viewer (both their own full page, nothing
    // scrollable behind them), this lightbox sits on top of the normal
    // scrollable storefront - lock the page underneath while it's open,
    // same as any real modal, restored on close either way.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [avatarOpen]);

  useSEO({
    title: creator ? `${creator.name} (@${creator.handle}), SCORPIO` : undefined,
    description: creator?.bio || (creator ? `${creator.name}'s storefront on SCORPIO, real guides, templates, and courses.` : undefined),
    image: creator?.avatar_path,
    url: `${SITE_ORIGIN}/@${handle}`,
    noindex: handle?.startsWith('demo-')
  });

  if (error) {
    return (
      <div className="not-found wrap">
        <h1>{error}</h1>
        <p className="muted">The link may be old, or this storefront may have closed.</p>
        <div className="not-found__actions">
          <Link to="/creators" className="btn btn--cta">Meet the creators</Link>
          <Link to="/discover" className="btn btn--ghost">Browse products</Link>
        </div>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="wrap" style={{ padding: '48px 20px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
          <div className="skeleton" style={{ width: 64, height: 64, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 20, width: '40%', marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 13, width: '25%' }} />
          </div>
        </div>
        <div className="product-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton" style={{ aspectRatio: '4/3' }} />
              <div style={{ padding: 14 }}>
                <div className="skeleton" style={{ height: 14, width: '80%', marginBottom: 10 }} />
                <div className="skeleton" style={{ height: 12, width: '50%', marginBottom: 14 }} />
                <div className="skeleton" style={{ height: 16, width: '35%' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="creator-header">
        <div className="wrap creator-header__inner">
          {/* Only a real photo is worth a full-size look — the
              letter-fallback tile has nothing bigger to show, so it stays
              a plain non-interactive div exactly like before. */}
          {creator.avatar_path ? (
            <button
              type="button"
              className="creator-header__avatar creator-header__avatar--tappable"
              style={{ background: `url(${creator.avatar_path}) center/cover` }}
              onClick={() => setAvatarOpen(true)}
              aria-label={`View ${creator.name}'s full profile picture`}
            />
          ) : (
            <div className="creator-header__avatar" style={{ background: 'var(--accent)' }}>
              {creator.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 className="creator-header__name">{creator.name}</h1>
              {!!creator.verified && <Seal />}
            </div>
            <p className="mono creator-header__handle">{SITE_HOST}/@{creator.handle}</p>
            <p className="creator-header__meta" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span>
                Joined {new Date(creator.created_at.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                {' '}&middot; {creator.products.length} product{creator.products.length === 1 ? '' : 's'}
              </span>
              {creator.review_count > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  &middot; <Stars value={creator.avg_rating} size={13} /> {creator.avg_rating} ({creator.review_count})
                </span>
              )}
            </p>
          </div>
        </div>
      </header>

      {avatarOpen && (
        <div className="avatar-lightbox" role="dialog" aria-modal="true" aria-label={`${creator.name}'s profile picture`} onClick={() => setAvatarOpen(false)}>
          <button type="button" className="avatar-lightbox__close" onClick={() => setAvatarOpen(false)} aria-label="Close">
            <FiX size={20} />
          </button>
          {/* stopPropagation so tapping the photo itself doesn't also
              trigger the backdrop's close-on-click. */}
          <img src={creator.avatar_path} alt={creator.name} className="avatar-lightbox__img" onClick={e => e.stopPropagation()} />
        </div>
      )}

      <div className="wrap" style={{ padding: '32px 20px 80px' }}>
        {creator.bio && <p className="muted" style={{ maxWidth: '60ch', lineHeight: 1.6, marginBottom: 40 }}>{creator.bio}</p>}

        {/* Used to be the reels themselves, a horizontal strip right here,
            scrolled straight into the product grid below with nothing but
            a heading between them. Now it's just the door to their own
            page (/@handle/reels), products and reels read as two
            different things instead of one blended feed. */}
        {reels && reels.length > 0 && (
          <Link to={`/@${creator.handle}/reels`} className="storefront-reels-link">
            <span className="storefront-reels-link__preview">
              <video src={reels[0].video_path} muted playsInline preload="metadata" />
            </span>
            <span className="storefront-reels-link__text">
              <strong>Watch {reels.length} reel{reels.length === 1 ? '' : 's'}</strong>
              <span>See {creator.name} in action</span>
            </span>
            <FiChevronRight size={18} />
          </Link>
        )}

        <h2 style={{ fontSize: '1.15rem', marginBottom: 16 }}>Products</h2>
        {creator.products.length === 0 && (
          <div className="empty-state">
            <strong>Nothing published yet.</strong>
          </div>
        )}
        {creator.products.length > 0 && (
          <div className="product-grid">
            {creator.products.map(p => (
              <ProductCard key={p.id} isOwner={myCreator?.id === creator.id} product={{
                ...p, creator_name: creator.name, creator_handle: creator.handle,
                creator_verified: creator.verified, creator_avatar: creator.avatar_path
              }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
