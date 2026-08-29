import { useEffect, useState } from 'react';
import { FiTrash2, FiEye, FiUploadCloud } from 'react-icons/fi';
import { api } from '../../lib/api';

export default function Reels() {
  const [reels, setReels] = useState(null);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);

  const [video, setVideo] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [caption, setCaption] = useState('');
  const [productId, setProductId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    api.get('/api/products/mine').then(all => setProducts(all.filter(p => p.status === 'published'))).catch(() => {});

    // /api/reels filters by handle, and this page doesn't have the
    // creator's own handle without an extra round trip — /api/auth/me
    // already carries it, and newly-uploaded reels get appended to state
    // directly in submit() below rather than re-fetched.
    api.get('/api/auth/me').then(({ creator }) => {
      if (!creator) return;
      fetch(`/api/reels?creator=${creator.handle}&limit=100`).then(r => r.json()).then(setReels).catch(() => setReels([]));
    });
  }, []);

  function handleVideo(e) {
    const f = e.target.files[0];
    setVideo(f);
    setVideoPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit(e) {
    e.preventDefault();
    setUploadError(null);
    if (!video) { setUploadError('Choose a video first.'); return; }
    setSubmitting(true);
    const body = new FormData();
    body.append('video', video);
    if (caption.trim()) body.append('caption', caption.trim());
    if (productId) body.append('product_id', productId);

    try {
      const reel = await api.post('/api/reels', body);
      setReels(r => [reel, ...(r || [])]);
      setVideo(null);
      setVideoPreview(null);
      setCaption('');
      setProductId('');
      e.target.reset();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id) {
    setDeletingId(id);
    try {
      await api.delete(`/api/reels/${id}`);
      setReels(r => r.filter(x => x.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: 10 }}>Reels</h1>
      <p className="muted" style={{ marginBottom: 28, maxWidth: '60ch' }}>
        A short video pitch for your storefront or a specific product, shown in the "Meet the creators" tray on the homepage and on your storefront. Link one to a product and buyers get a "Shop this" button right on the video.
      </p>

      <div className="form-layout">
        <form onSubmit={submit} style={{ maxWidth: 480 }}>
          <div className="field">
            <label htmlFor="reel-video">Video</label>
            <input id="reel-video" type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleVideo}
              style={{ padding: '.6rem' }} />
            <small>MP4, WebM, or MOV. Up to 60MB. A short 30-60 second clip works best.</small>
            {videoPreview && (
              <video src={videoPreview} controls style={{ width: '100%', maxHeight: 320, marginTop: 10, borderRadius: 'var(--radius-sm)', background: '#000' }} />
            )}
          </div>

          <div className="field">
            <label htmlFor="reel-product">Link to a product (optional)</label>
            <select id="reel-product" value={productId} onChange={e => setProductId(e.target.value)}>
              <option value="">Just a storefront intro, no product</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <small>Adds a "Shop this" button straight to that product while the reel plays.</small>
          </div>

          <div className="field">
            <label htmlFor="reel-caption">Caption (optional)</label>
            <textarea id="reel-caption" value={caption} onChange={e => setCaption(e.target.value)}
              placeholder="Why you made this, or what's in it for the buyer" />
          </div>

          {uploadError && <p className="error-text">{uploadError}</p>}
          <button className="btn btn--primary" disabled={submitting} type="submit">
            <FiUploadCloud size={15} /> {submitting ? 'Uploading...' : 'Upload reel'}
          </button>
        </form>
      </div>

      <h2 style={{ fontSize: '1.1rem', margin: '36px 0 16px' }}>Your reels</h2>
      {error && <p className="error-text">{error}</p>}

      {!reels && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="skeleton" style={{ height: 72, borderRadius: 'var(--radius)' }} />
        </div>
      )}

      {reels && reels.length === 0 && (
        <div className="empty-state">
          <strong>No reels yet.</strong>
          Upload one above to show up in the homepage tray and your storefront.
        </div>
      )}

      {reels && reels.length > 0 && (
        <div className="reels-manage-grid">
          {reels.map(r => (
            <div key={r.id} className="card reel-manage-card">
              <video src={r.video_path} className="reel-manage-card__video" muted playsInline preload="metadata" />
              <div className="reel-manage-card__body">
                {r.product_title && <p className="reel-manage-card__product">Linked: {r.product_title}</p>}
                {r.caption && <p className="reel-manage-card__caption">{r.caption}</p>}
                <div className="reel-manage-card__footer">
                  <span className="muted" style={{ fontSize: '.78rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <FiEye size={12} /> {r.view_count}
                  </span>
                  <button onClick={() => remove(r.id)} disabled={deletingId === r.id} className="btn btn--ghost btn--sm">
                    <FiTrash2 size={13} /> {deletingId === r.id ? 'Removing...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
