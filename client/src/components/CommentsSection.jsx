import { forwardRef, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api';

const CommentsSection = forwardRef(function CommentsSection({ productId }, ref) {
  const { user } = useAuth();
  const [comments, setComments] = useState(null);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/products/${productId}/comments`).then(r => r.json()).then(setComments).catch(() => setComments([]));
  }, [productId]);

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const comment = await api.post(`/api/products/${productId}/comments`, { body });
      setComments(c => [...c, comment]);
      setBody('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id) {
    setError(null);
    try {
      await api.delete(`/api/products/${productId}/comments/${id}`);
      setComments(c => c.filter(comment => comment.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div ref={ref} className="card card--pad" style={{ marginTop: 32 }}>
      <p style={{ fontWeight: 600, marginBottom: 16 }}>Comments {comments ? `(${comments.length})` : ''}</p>

      {comments === null && <p className="muted" style={{ fontSize: '.9rem' }}>Loading...</p>}
      {comments && comments.length === 0 && <p className="muted" style={{ fontSize: '.9rem' }}>No comments yet. Be the first.</p>}

      <div style={{ display: 'grid', gap: 14, marginBottom: comments?.length ? 20 : 0 }}>
        {comments?.map(c => (
          <div key={c.id} style={{ display: 'flex', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: c.avatar_url ? `url(${c.avatar_url}) center/cover` : 'var(--brand-tint)'
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 600, fontSize: '.85rem' }}>@{c.username}</p>
              <p style={{ fontSize: '.9rem', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{c.body}</p>
            </div>
            {!!c.can_delete && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => remove(c.id)} aria-label={`Delete comment by ${c.username}`}>Delete</button>
            )}
          </div>
        ))}
      </div>

      {user ? (
        <form onSubmit={submit} style={{ display: 'flex', gap: 10 }}>
          <label htmlFor="comment-body" style={{
            position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0
          }}>Add a comment</label>
          <input id="comment-body" value={body} maxLength={1000} onChange={e => setBody(e.target.value)} placeholder="Add a comment"
            style={{
              flex: 1, padding: '.7rem .9rem', border: '1.5px solid var(--line-strong)', borderRadius: 'var(--radius-sm)',
              background: 'var(--field-bg)', color: 'var(--ink)', fontSize: '1rem'
            }} />
          <button className="btn btn--primary btn--sm" disabled={submitting} type="submit">Post</button>
        </form>
      ) : (
        <p className="muted" style={{ fontSize: '.88rem' }}>
          <a href="/login?role=buyer" style={{ color: 'var(--link-ink)', fontWeight: 600 }}>Log in</a> to comment.
        </p>
      )}
      {error && <p className="error-text" style={{ marginTop: 10 }}>{error}</p>}
    </div>
  );
});

export default CommentsSection;
