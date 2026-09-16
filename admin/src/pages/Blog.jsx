import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdmin } from '../context/AdminContext.jsx';
import { SITE_ORIGIN } from '../lib/site';

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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <p className="muted" style={{ fontSize: '.88rem' }}>{posts.length} post{posts.length === 1 ? '' : 's'}</p>
        <Link to="/blog/new" className="btn btn--gold btn--sm">New post</Link>
      </div>

      {posts.length === 0 ? (
        <p className="muted" style={{ padding: 16, textAlign: 'center' }}>No posts yet. <Link to="/blog/new">Write the first one</Link>.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th></th><th>Title</th><th>Status</th><th>Author</th><th>Date</th><th></th></tr>
            </thead>
            <tbody>
              {posts.map(post => (
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
                    {post.status === 'published'
                      ? <span className="badge badge--green">Published</span>
                      : <span className="badge badge--neutral">Draft</span>}
                  </td>
                  <td data-label="Author">{post.author_name}</td>
                  <td data-label="Date" className="muted">
                    {post.published_at ? formatDate(post.published_at) : formatDate(post.created_at)}
                  </td>
                  <td data-label="" style={{ display: 'flex', gap: 8 }}>
                    {post.status === 'published' && (
                      <a href={`${SITE_ORIGIN}/blog/${post.slug}`} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">View</a>
                    )}
                    <Link to={`/blog/${post.id}/edit`} className="btn btn--ghost btn--sm">Edit</Link>
                    <button onClick={() => handleDelete(post)} className="btn btn--ghost btn--sm">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
