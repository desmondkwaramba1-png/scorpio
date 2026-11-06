import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiEye } from 'react-icons/fi';
import { useAdmin } from '../context/AdminContext.jsx';
import { SITE_ORIGIN } from '../lib/site';

const STATUS_LABEL = {
  draft: { text: 'Draft', className: 'badge--neutral' },
  pending_review: { text: 'Pending review', className: 'badge--highlight' },
  published: { text: 'Published', className: 'badge--success' },
  rejected: { text: 'Rejected', className: 'badge--neutral' }
};

function formatDate(sqliteDatetime) {
  return new Date(sqliteDatetime.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Blog() {
  const { adminFetch, adminDelete } = useAdmin();
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminFetch('/api/blog/admin/posts').then(setPosts).catch(err => setError(err.message));
  }, [adminFetch]);

  async function handleDelete(post) {
    if (!window.confirm(`Delete "${post.title}"? This can't be undone.`)) return;
    try {
      await adminDelete(`/api/blog/admin/posts/${post.id}`);
      setPosts(list => list.filter(p => p.id !== post.id));
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <p className="error-text">{error}</p>;
  if (!posts) return <p className="muted">Loading...</p>;

  const pendingCount = posts.filter(p => p.status === 'pending_review').length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <p className="muted" style={{ fontSize: '.88rem' }}>
          {posts.length} post{posts.length === 1 ? '' : 's'}
          {pendingCount > 0 && <> &middot; <strong style={{ color: 'var(--accent-ink)' }}>{pendingCount} awaiting review</strong></>}
        </p>
        <Link to="/blog/new" className="btn btn--cta btn--sm">New post</Link>
      </div>

      {posts.length === 0 ? (
        <p className="muted" style={{ padding: 16, textAlign: 'center' }}>No posts yet. <Link to="/blog/new">Write the first one</Link>.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th><span className="sr-only">Cover</span></th><th>Title</th><th>Status</th><th>Author</th><th>Date</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {posts.map(post => {
                const label = STATUS_LABEL[post.status] || { text: post.status, className: 'badge--neutral' };
                return (
                  <tr key={post.id}>
                    <td data-label="">
                      <div style={{
                        width: 44, height: 44, borderRadius: 6, flexShrink: 0,
                        background: post.cover_path ? `url(${post.cover_path}) center/cover` : 'var(--paper)',
                        border: '1px solid var(--line)'
                      }} />
                    </td>
                    <td data-label="Title" style={{ fontWeight: 600 }}>{post.title}</td>
                    <td data-label="Status">
                      <span className={`badge ${label.className}`}>{label.text}</span>
                    </td>
                    <td data-label="Author">{post.creator_handle ? `@${post.creator_handle}` : post.author_name}</td>
                    <td data-label="Date" className="muted">
                      {post.published_at ? formatDate(post.published_at) : formatDate(post.created_at)}
                    </td>
                    <td data-label="" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {/* Approve/Reject deliberately don't live here anymore
                          — a button sitting right in the list let a pending
                          post get approved without anyone actually reading
                          it first. Reviewing now always means opening the
                          real post (title, rendered body, the product it
                          links) and deciding from there. */}
                      {post.status === 'pending_review' ? (
                        <Link to={`/blog/${post.id}/edit`} className="btn btn--cta btn--sm"><FiEye size={13} /> Review</Link>
                      ) : (
                        <Link to={`/blog/${post.id}/edit`} className="btn btn--ghost btn--sm">Edit</Link>
                      )}
                      {post.status === 'published' && (
                        <a href={`${SITE_ORIGIN}/blog/${post.slug}`} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">View</a>
                      )}
                      <button onClick={() => handleDelete(post)} className="btn btn--ghost btn--sm">Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
