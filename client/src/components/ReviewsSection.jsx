import { forwardRef, useEffect, useState } from 'react';
import { FiStar, FiTrash2 } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api';

export function Stars({ value, size = 14 }) {
  const rounded = Math.round(value || 0);
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <FiStar key={n} size={size} fill={n <= rounded ? 'var(--star)' : 'none'} color="var(--accent-icon)" />
      ))}
    </span>
  );
}

function StarInput({ value, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n} type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
        >
          <FiStar size={22} fill={n <= (hover || value) ? 'var(--star)' : 'none'} color="var(--accent-icon)" />
        </button>
      ))}
    </span>
  );
}

// Reviews are gated on an actual paid purchase, checked server-side (see
// GET .../reviews' eligible_to_review), this component never shows a form
// to someone who hasn't bought the product and would just get a 403.
const ReviewsSection = forwardRef(function ReviewsSection({ productSlug }, ref) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function load() {
    fetch(`/api/products/${productSlug}/reviews`, { credentials: 'include' })
      .then(r => r.json())
      .then(json => {
        setData(json);
        if (json.my_review) { setRating(json.my_review.rating); setBody(json.my_review.body || ''); }
      })
      .catch(() => setData({ reviews: [], avg_rating: null, review_count: 0, my_review: null, eligible_to_review: false }));
  }

  useEffect(load, [productSlug]);

  async function submit(e) {
    e.preventDefault();
    if (!rating) { setError('Choose a star rating.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      if (data.my_review) {
        await api.patch(`/api/products/${productSlug}/reviews/mine`, { rating, body });
      } else {
        await api.post(`/api/products/${productSlug}/reviews`, { rating, body });
      }
      setEditing(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function removeReview() {
    setSubmitting(true);
    setError(null);
    try {
      await api.delete(`/api/products/${productSlug}/reviews/mine`);
      setRating(0);
      setBody('');
      setEditing(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!data) return null;

  const showForm = user && editing;

  return (
    <div ref={ref} className="card card--pad" style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <p style={{ fontWeight: 600 }}>Reviews {data.review_count > 0 ? `(${data.review_count})` : ''}</p>
        {data.avg_rating != null && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Stars value={data.avg_rating} />
            <span className="mono muted" style={{ fontSize: '.85rem' }}>{data.avg_rating}</span>
          </span>
        )}
      </div>

      {data.reviews.length === 0 && (
        <p className="muted" style={{ fontSize: '.9rem' }}>No reviews yet. Buyers can review after their order is paid.</p>
      )}

      <div style={{ display: 'grid', gap: 16, marginBottom: data.reviews.length ? 20 : 0 }}>
        {data.reviews.map(r => (
          <div key={r.id} style={{ display: 'flex', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: r.avatar_url ? `url(${r.avatar_url}) center/cover` : 'var(--brand-tint)'
            }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ fontWeight: 600, fontSize: '.85rem' }}>@{r.username}</p>
                <Stars value={r.rating} size={12} />
              </div>
              {r.body && <p style={{ fontSize: '.9rem', lineHeight: 1.5, marginTop: 2 }}>{r.body}</p>}
            </div>
          </div>
        ))}
      </div>

      {!user && (
        <p className="muted" style={{ fontSize: '.88rem' }}>
          <a href="/login?role=buyer" style={{ color: 'var(--link-ink)', fontWeight: 600 }}>Log in</a> to review this product.
        </p>
      )}

      {user && data.my_review && !editing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="muted" style={{ fontSize: '.85rem' }}>You reviewed this product.</span>
          <button type="button" onClick={() => setEditing(true)} className="btn btn--ghost btn--sm">Edit</button>
          <button type="button" onClick={removeReview} disabled={submitting} className="btn btn--ghost btn--sm">
            <FiTrash2 size={13} /> Remove
          </button>
        </div>
      )}

      {user && !data.my_review && !data.eligible_to_review && (
        <p className="muted" style={{ fontSize: '.85rem' }}>Only buyers who've completed a purchase can leave a review.</p>
      )}

      {user && data.eligible_to_review && !data.my_review && !editing && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
          Leave an optional review
        </button>
      )}

      {showForm && (
        <form onSubmit={submit} style={{ marginTop: data.my_review ? 14 : 0, display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {!data.my_review && <p className="muted" style={{ fontSize: '.82rem' }}>Only if you’ve had a chance to use the product. Your review is optional.</p>}
          <StarInput value={rating} onChange={setRating} />
          <textarea
            value={body} onChange={e => setBody(e.target.value)}
            placeholder="Share what you thought (optional)" rows={3}
            style={{
              padding: '.7rem .9rem', border: '1.5px solid var(--line-strong)', borderRadius: 'var(--radius-sm)',
              background: 'var(--field-bg)', color: 'var(--ink)', fontSize: '.95rem', resize: 'vertical', fontFamily: 'inherit'
            }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn--primary btn--sm" disabled={submitting} type="submit">
              {data.my_review ? 'Save changes' : 'Post review'}
            </button>
            {data.my_review && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>Cancel</button>
            )}
          </div>
        </form>
      )}
      {error && <p className="error-text" style={{ marginTop: 10 }}>{error}</p>}
    </div>
  );
});

export default ReviewsSection;
