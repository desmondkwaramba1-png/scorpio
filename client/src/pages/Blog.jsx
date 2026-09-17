import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
function BlogCard({ post, featured }) {
  return (
    <Link to={`/blog/${post.slug}`} className={`blog-card${featured ? ' blog-card--featured' : ''}`}>
      <div className="blog-card__cover">
        {post.cover_path && (
          <>
            <div className="blog-card__cover-backdrop" style={{ backgroundImage: `url(${post.cover_path})` }} />
            <div className="blog-card__cover-image" style={{ backgroundImage: `url(${post.cover_path})` }} />
          </>
        )}
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
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/blog?limit=20').then(setPosts).catch(err => setError(err.message));
  }, []);

  useSEO({
    title: 'Blog, real guides for selling and buying digitally in Zimbabwe | SCORPIO',
    description: 'How to start an online business, price your first product, get paid with EcoCash, and more, real guides from the SCORPIO team.',
    url: `${SITE_ORIGIN}/blog`
  });

  if (error) return <div className="wrap center-page" style={{ padding: 20 }}><p className="error-text">{error}</p></div>;

  return (
    <div className="wrap" style={{ padding: '48px 20px 80px' }}>
      <div className="section__head" style={{ marginBottom: 40 }}>
        <p className="section__eyebrow">THE SCORPIO BLOG</p>
        <h1 style={{ fontSize: '2rem', marginBottom: 10 }}>Guides for building something real</h1>
        <p className="muted" style={{ fontSize: '1.05rem', lineHeight: 1.6 }}>
          How to start, price, and grow a digital business in Zimbabwe, no fluff, written by the people building SCORPIO.
        </p>
      </div>

      {!posts && (
        <div style={{ display: 'grid', gap: 24 }}>
          <div className="skeleton" style={{ height: 320, borderRadius: 'var(--radius)' }} />
          <div className="blog-grid">
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
        </div>
      )}

      {posts && posts.length === 0 && (
        <div className="empty-state">
          <strong>Nothing published yet.</strong>
          Check back soon, real guides are on the way.
        </div>
      )}

      {posts && posts.length > 0 && (
        <>
          <BlogCard post={posts[0]} featured />
          {posts.length > 1 && (
            <div className="blog-grid" style={{ marginTop: 28 }}>
              {posts.slice(1).map(post => <BlogCard key={post.id} post={post} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
