import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FiBookOpen, FiSearch, FiRefreshCw, FiAlertCircle, FiArrowUpRight } from 'react-icons/fi';
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
  const byline = post.creator_handle ? `@${post.creator_handle}` : post.author_name;
  return (
    <Link to={`/blog/${post.slug}`} className="blog-card">
      <div className="blog-card__cover">
        {post.cover_path && (
          <>
            <div className="blog-card__cover-backdrop" style={{ backgroundImage: `url(${post.cover_path})` }} />
            <div className="blog-card__cover-image" style={{ backgroundImage: `url(${post.cover_path})` }} />
          </>
        )}
        {!post.cover_path && (
          <div className="blog-card__cover-empty">
            <FiBookOpen size={34} />
            <span>SCORPIO FIELD NOTES</span>
          </div>
        )}
        <span className="blog-card__read-badge"><FiBookOpen size={11} /> Read</span>
      </div>
      <div className="blog-card__body">
        <div className="blog-card__byline">
          <span
            className="blog-card__avatar"
            style={post.creator_avatar ? { backgroundImage: `url(${post.creator_avatar})` } : undefined}
          >
            {!post.creator_avatar && byline.replace('@', '').charAt(0).toUpperCase()}
          </span>
          <span className="blog-card__byline-text">{byline} &middot; {formatDate(post.published_at)}</span>
        </div>
        <h2 className="blog-card__title">{post.title}</h2>
        {post.excerpt && <p className="blog-card__excerpt">{post.excerpt}</p>}
        <span className="blog-card__open">Read the article <FiArrowUpRight size={15} /></span>
      </div>
    </Link>
  );
}

function FeaturedPost({ post }) {
  const byline = post.creator_handle ? `@${post.creator_handle}` : post.author_name;
  return (
    <Link to={`/blog/${post.slug}`} className="blog-featured">
      <div className="blog-featured__media">
        {post.cover_path ? (
          <>
            <div className="blog-featured__backdrop" style={{ backgroundImage: `url(${post.cover_path})` }} />
            <div className="blog-featured__image" style={{ backgroundImage: `url(${post.cover_path})` }} />
          </>
        ) : (
          <div className="blog-featured__empty"><FiBookOpen size={42} /><span>SCORPIO FIELD NOTES</span></div>
        )}
      </div>
      <div className="blog-featured__content">
        <span className="blog-featured__label">Featured story</span>
        <h2>{post.title}</h2>
        {post.excerpt && <p>{post.excerpt}</p>}
        <span className="blog-featured__byline">
          <span className="blog-card__avatar" style={post.creator_avatar ? { backgroundImage: `url(${post.creator_avatar})` } : undefined}>
            {!post.creator_avatar && byline.replace('@', '').charAt(0).toUpperCase()}
          </span>
          {byline} <span aria-hidden="true">&middot;</span> {formatDate(post.published_at)}
        </span>
        <span className="blog-featured__read">Read the story <FiArrowUpRight size={16} /></span>
      </div>
    </Link>
  );
}

export default function Blog() {
  const [params, setParams] = useSearchParams();
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(null);

  const q = params.get('q') || '';

  function loadBlog() {
    const qs = new URLSearchParams({ limit: '30' });
    if (q) qs.set('q', q);
    setPosts(null);
    setError(null);
    api.get(`/api/blog?${qs.toString()}`)
      .then(data => setPosts(Array.isArray(data) ? data : []))
      .catch(err => {
        setPosts([]);
        setError(err.message || 'Please check your connection and try again.');
      });
  }

  useEffect(() => {
    loadBlog();
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

  if (error) {
    return (
      <div className="wrap center-page" style={{ padding: 20 }}>
        <div className="page-state page-state--error">
          <div className="page-state__icon"><FiAlertCircle size={28} /></div>
          <h2>We couldn’t load the latest stories.</h2>
          <p>{error}</p>
          <button className="btn btn--primary" onClick={loadBlog}>
            <FiRefreshCw size={15} /> Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="blog-page wrap">
      <header className="blog-heading">
        <div className="blog-heading__copy">
          <p className="section__eyebrow mono"><FiBookOpen size={13} /> THE SCORPIO JOURNAL</p>
          <h1>Ideas worth putting into practice.</h1>
          <p>Stories, useful guides, and sharp ideas for Zimbabwe’s independent makers and digital businesses.</p>
        </div>
        <label className="input-icon blog-search">
          <FiSearch size={16} />
          <input
            value={q} onChange={e => updateQuery(e.target.value)}
            placeholder="Search articles..."
            aria-label="Search articles"
          />
        </label>
      </header>

      {!posts && !error && (
        <div className="blog-grid blog-grid--loading">
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
          <strong>{q ? `No stories match "${q}".` : 'Nothing published yet.'}</strong>
          {q ? 'Try another search.' : 'New stories will appear here as they are published.'}
        </div>
      )}

      {posts && posts.length > 0 && (
        q ? (
          <section className="blog-archive" aria-label="Search results">
            <div className="blog-section-heading">
              <h2>Search results</h2>
              <span>{posts.length} {posts.length === 1 ? 'story' : 'stories'}</span>
            </div>
            <div className="blog-grid">
              {posts.map(post => <BlogCard key={post.id} post={post} />)}
            </div>
          </section>
        ) : (
          <>
            <section aria-label="Featured story">
              <FeaturedPost post={posts[0]} />
            </section>
            {posts.length > 1 && (
              <section className="blog-archive" aria-label="Latest stories">
                <div className="blog-section-heading">
                  <h2>Latest stories</h2>
                  <span>{posts.length - 1} {posts.length === 2 ? 'story' : 'stories'}</span>
                </div>
                <div className="blog-grid">
                  {posts.slice(1).map(post => <BlogCard key={post.id} post={post} />)}
                </div>
              </section>
            )}
          </>
        )
      )}
    </div>
  );
}
