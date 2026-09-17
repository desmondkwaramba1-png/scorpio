import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FiBookOpen, FiSearch } from 'react-icons/fi';
import { api } from '../lib/api';
import { useSEO } from '../lib/seo';
import { SITE_ORIGIN } from '../lib/site';

function formatDate(sqliteDatetimeOrIso) {
  const raw = sqliteDatetimeOrIso.includes('T') ? sqliteDatetimeOrIso : sqliteDatetimeOrIso.replace(' ', 'T') + 'Z';
  return new Date(raw).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// A card's own reading-time needs the body to compute from, which the
// list endpoint deliberately doesn't send (see routes/blog.js's
// LIST_FIELDS — a list of 20 posts has no reason to ship 20 full article
// bodies over the wire). The excerpt is the only text this card has, so
// reading time here is a rough estimate off that instead — real per-post
// reading time is correct once you're actually on the post itself.
function BlogCard({ post }) {
  return (
    <Link to={`/blog/${post.slug}`} className="blog-card">
      <div className="blog-card__cover">
        {post.cover_path && (
          <>
            <div className="blog-card__cover-backdrop" style={{ backgroundImage: `url(${post.cover_path})` }} />
            <div className="blog-card__cover-image" style={{ backgroundImage: `url(${post.cover_path})` }} />
          </>
        )}
        <span className="blog-card__read-badge"><FiBookOpen size={11} /> Read</span>
      </div>
      <div className="blog-card__body">
        <p className="blog-card__meta">
          {formatDate(post.published_at)} &middot; {post.creator_handle ? `@${post.creator_handle}` : post.author_name}
        </p>
        <h2 className="blog-card__title">{post.title}</h2>
        {post.excerpt && <p className="blog-card__excerpt">{post.excerpt}</p>}
      </div>
    </Link>
  );
}

export default function Blog() {
  const [params, setParams] = useSearchParams();
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(null);

  const q = params.get('q') || '';

  useEffect(() => {
    const qs = new URLSearchParams({ limit: '30' });
    if (q) qs.set('q', q);
    setPosts(null);
    setError(null);
    api.get(`/api/blog?${qs.toString()}`).then(setPosts).catch(err => setError(err.message));
  }, [q]);

  function updateQuery(value) {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value); else next.delete('q');
    setParams(next);
  }

  useSEO({
    title: q
      ? `"${q}", Blog search results | SCORPIO`
      : 'Blog, real guides for selling and buying digitally in Zimbabwe | SCORPIO',
    description: 'How to start an online business, price your first product, get paid with EcoCash, and more, real guides from the SCORPIO team.',
    url: `${SITE_ORIGIN}/blog`
  });

  if (error) return <div className="wrap center-page" style={{ padding: 20 }}><p className="error-text">{error}</p></div>;

  return (
    <div className="wrap" style={{ padding: '40px 20px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <FiBookOpen size={22} color="var(--green)" />
        <h1 style={{ fontSize: '1.8rem' }}>The SCORPIO Blog</h1>
      </div>
      <p className="muted" style={{ marginBottom: 24 }}>
        How to start, price, and grow a digital business in Zimbabwe, no fluff, written by the people building SCORPIO.
      </p>

      <div className="discover-filters">
        <div className="input-icon" style={{ flex: '1 1 220px' }}>
          <FiSearch size={15} />
          <input
            value={q} onChange={e => updateQuery(e.target.value)}
            placeholder="Search guides and articles..."
          />
        </div>
      </div>

      {posts && posts.length > 0 && (
        <p className="muted" style={{ fontSize: '.85rem', margin: '16px 0' }}>
          {posts.length} post{posts.length === 1 ? '' : 's'}
        </p>
      )}

      {!posts && !error && (
        <div className="blog-grid" style={{ marginTop: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton" style={{ aspectRatio: '16/9' }} />
              <div style={{ padding: 16 }}>
                <div className="skeleton" style={{ height: 13, width: '40%', marginBottom: 10 }} />
                <div className="skeleton" style={{ height: 18, width: '85%' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {posts && posts.length === 0 && (
        <div className="empty-state">
          <strong>{q ? `No posts match "${q}".` : 'Nothing published yet.'}</strong>
          {q ? 'Try a different search.' : 'Check back soon, real guides are on the way.'}
        </div>
      )}

      {posts && posts.length > 0 && (
        <div className="blog-grid">
          {posts.map(post => <BlogCard key={post.id} post={post} />)}
        </div>
      )}
    </div>
  );
}
