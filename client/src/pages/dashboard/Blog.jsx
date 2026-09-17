import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus, FiEdit2, FiTrash2, FiAlertTriangle } from 'react-icons/fi';
import { api } from '../../lib/api';

const STATUS_LABEL = {
  draft: { text: 'Draft', className: 'badge--neutral' },
  pending_review: { text: 'Pending review', className: 'badge--gold' },
  published: { text: 'Published', className: 'badge--green' },
  rejected: { text: 'Changes requested', className: 'badge--neutral' }
};

function formatDate(sqliteDatetime) {
  return new Date(sqliteDatetime.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DashboardBlog() {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/blog/mine').then(setPosts).catch(err => setError(err.message));
  }, []);

  async function handleDelete(post) {
    if (!window.confirm(`Delete "${post.title}"? This can't be undone.`)) return;
    try {
      await api.delete(`/api/blog/mine/${post.id}`);
      setPosts(list => list.filter(p => p.id !== post.id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.5rem' }}>Your blog posts</h1>
        <Link to="/dashboard/blog/new" className="btn btn--primary btn--sm"><FiPlus size={15} /> New post</Link>
      </div>
      <p className="muted" style={{ fontSize: '.88rem', marginBottom: 24 }}>
        Write about what you know, link one of your own products at the end, and reach people searching for the problem it solves.
        Every post goes to SCORPIO for a quick review before it's visible to anyone else.
      </p>

      {error && <p className="error-text">{error}</p>}

      {!posts && !error && (
        <div style={{ display: 'grid', gap: 10 }}>
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 'var(--radius)' }} />)}
        </div>
      )}

      {posts && posts.length === 0 && (
        <div className="empty-state">
          <strong>No posts yet.</strong>
          <Link to="/dashboard/blog/new">Write your first one</Link>
        </div>
      )}

      {posts && posts.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {posts.map(post => {
            const label = STATUS_LABEL[post.status] || { text: post.status, className: 'badge--neutral' };
            return (
              <div key={post.id} className="card card--pad">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</p>
                    <p className="muted" style={{ fontSize: '.82rem' }}>
                      {post.published_at ? `Published ${formatDate(post.published_at)}` : `Created ${formatDate(post.created_at)}`}
                      {post.featured_product_title && <> &middot; features "{post.featured_product_title}"</>}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span className={`badge ${label.className}`}>{label.text}</span>
                    <Link to={`/dashboard/blog/${post.id}/edit`} className="btn btn--ghost btn--sm"><FiEdit2 size={13} /></Link>
                    <button onClick={() => handleDelete(post)} className="btn btn--ghost btn--sm"><FiTrash2 size={13} /></button>
                  </div>
                </div>
                {post.status === 'rejected' && post.rejection_note && (
                  <p style={{ marginTop: 10, fontSize: '.85rem', display: 'flex', alignItems: 'flex-start', gap: 6, color: 'var(--red)' }}>
                    <FiAlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {post.rejection_note}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
