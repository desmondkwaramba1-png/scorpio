import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus, FiEdit2, FiTrash2 } from 'react-icons/fi';
import { adminApi } from '../../lib/api';
import AdminKeyGate from '../../components/AdminKeyGate.jsx';

const STATUS_LABEL = {
  published: { text: 'Published', className: 'badge--green' },
  draft: { text: 'Draft', className: 'badge--neutral' }
};

function formatDate(sqliteDatetime) {
  return new Date(sqliteDatetime.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function PostList({ adminKey, onInvalidKey }) {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setPosts(null);
    adminApi.get('/api/blog/admin/posts', adminKey)
      .then(setPosts)
      .catch(err => { if (err.message === 'Invalid admin key.') onInvalidKey(); else setError(err.message); });
  }, [adminKey]);

  async function handleDelete(post) {
    if (!window.confirm(`Delete "${post.title}"? This can't be undone.`)) return;
    try {
      await adminApi.delete(`/api/blog/admin/posts/${post.id}`, adminKey);
      setPosts(list => list.filter(p => p.id !== post.id));
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <div className="wrap" style={{ padding: '80px 20px' }}><p className="error-text">{error}</p></div>;

  return (
    <div className="wrap" style={{ padding: '40px 20px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: '1.5rem' }}>Blog posts</h1>
        <Link to="/admin/blog/new" className="btn btn--gold"><FiPlus size={15} /> New post</Link>
      </div>

      {!posts && (
        <div style={{ display: 'grid', gap: 10 }}>
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 'var(--radius)' }} />)}
        </div>
      )}

      {posts && posts.length === 0 && (
        <div className="empty-state">
          <strong>No posts yet.</strong>
          <Link to="/admin/blog/new">Write the first one</Link>
        </div>
      )}

      {posts && posts.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {posts.map(post => {
            const label = STATUS_LABEL[post.status] || { text: post.status, className: 'badge--neutral' };
            return (
              <div key={post.id} className="card card--pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</p>
                  <p className="muted" style={{ fontSize: '.82rem' }}>
                    {post.author_name} &middot; {post.published_at ? `Published ${formatDate(post.published_at)}` : `Created ${formatDate(post.created_at)}`}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span className={`badge ${label.className}`}>{label.text}</span>
                  <Link to={`/admin/blog/${post.id}/edit`} className="btn btn--ghost btn--sm"><FiEdit2 size={13} /></Link>
                  <button onClick={() => handleDelete(post)} className="btn btn--ghost btn--sm"><FiTrash2 size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminBlogList() {
  return <AdminKeyGate>{(key, onInvalidKey) => <PostList adminKey={key} onInvalidKey={onInvalidKey} />}</AdminKeyGate>;
}
