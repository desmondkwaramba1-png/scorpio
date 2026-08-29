import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FiPlay } from 'react-icons/fi';
import Seal from '../components/Seal.jsx';
import { Stars } from '../components/ReviewsSection.jsx';
import ProductCard from '../components/ProductCard.jsx';
import ReelViewer from '../components/ReelViewer.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { SITE_HOST } from '../lib/site.js';

export default function CreatorProfile() {
  const { handle: rawHandle } = useParams();
  // The route is "/:handle" (not "/@:handle" — React Router won't match a
  // literal prefix fused with a param in one segment), so the captured
  // value still has the leading "@" from the URL. Strip it before using it
  // as the actual handle anywhere.
  const handle = rawHandle.replace(/^@/, '');
  const { creator: myCreator } = useAuth();
  const [creator, setCreator] = useState(null);
  const [error, setError] = useState(null);
  const [reels, setReels] = useState(null);
  const [viewingIndex, setViewingIndex] = useState(null);

  useEffect(() => {
    setCreator(null);
    setError(null);
    setReels(null);
    fetch(`/api/creators/${handle}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setCreator)
      .catch(() => setError('This creator could not be found.'));
    fetch(`/api/reels?creator=${handle}`).then(r => r.json()).then(setReels).catch(() => setReels([]));
  }, [handle]);

  if (error) return <div className="wrap" style={{ padding: '80px 20px', textAlign: 'center' }}><p className="error-text">{error}</p></div>;

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
          <div
            className="creator-header__avatar"
            style={{ background: creator.avatar_path ? `url(${creator.avatar_path}) center/cover` : 'var(--gold)' }}
          >
            {!creator.avatar_path && creator.name.charAt(0).toUpperCase()}
          </div>
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

      <div className="wrap" style={{ padding: '32px 20px 80px' }}>
        {creator.bio && <p className="muted" style={{ maxWidth: '60ch', lineHeight: 1.6, marginBottom: 40 }}>{creator.bio}</p>}

        {reels && reels.length > 0 && (
          <>
            <h2 style={{ fontSize: '1.15rem', marginBottom: 16 }}>Reels</h2>
            <div className="storefront-reels">
              {reels.map((r, i) => (
                <button key={r.id} type="button" className="storefront-reel" onClick={() => setViewingIndex(i)}>
                  <video src={r.video_path} muted playsInline preload="metadata" />
                  <span className="storefront-reel__play"><FiPlay size={16} /></span>
                  {r.product_title && <span className="storefront-reel__tag">{r.product_title}</span>}
                </button>
              ))}
            </div>
          </>
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

      {viewingIndex !== null && (
        <ReelViewer reels={reels} startIndex={viewingIndex} onClose={() => setViewingIndex(null)} />
      )}
    </div>
  );
}
