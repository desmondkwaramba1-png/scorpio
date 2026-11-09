import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FiSearch, FiRefreshCw } from 'react-icons/fi';
import { api } from '../lib/api';
import { useSEO } from '../lib/seo';
import { SITE_ORIGIN } from '../lib/site';
import StoryCard, { StoryCover, StoryMeta, storySummary } from '../components/StoryCard.jsx';

function FeaturedStory({ post }) {
  const author = post.creator_handle ? `@${post.creator_handle}` : post.author_name;
  return (
    <Link to={`/blog/${post.slug}`} className="journal-feature">
      <StoryCover post={post} className="journal-feature__cover" />
      <div className="journal-feature__text">
        <StoryMeta post={post} />
        <h2 className="journal-feature__title">{post.title}</h2>
        <p className="journal-feature__summary">{storySummary(post, 220)}</p>
        <p className="journal-feature__author">By {author}</p>
      </div>
    </Link>
  );
}

export default function Blog() {
  const [params, setParams] = useSearchParams();
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(null);
  const q = params.get('q') || '';

  function load() {
    const qs = new URLSearchParams({ limit: '30' });
    if (q) qs.set('q', q);
    setPosts(null);
    setError(null);
    api.get(`/api/blog?${qs}`)
      .then(data => setPosts(Array.isArray(data) ? data : []))
      .catch(err => { setPosts([]); setError(err.message || 'Check your connection and try again.'); });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [q]);

  function search(value) {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value); else next.delete('q');
    setParams(next, { replace: true });
  }

  useSEO({
    title: q ? `"${q}" in the blog | SCORPIO` : 'Blog: guides for selling and buying digital products in Zimbabwe | SCORPIO',
    description: 'How to start an online business, price your first product, get paid with EcoCash, and more. Practical guides from SCORPIO.',
    url: `${SITE_ORIGIN}/blog`
  });

  const [featured, ...rest] = posts || [];

  return (
    <div className="journal wrap">
      <header className="journal-head">
        <div>
          <h1 className="journal-head__title">Blog</h1>
          <p className="journal-head__intro">Practical guides for making, selling and buying digital products in Zimbabwe.</p>
        </div>
        <label className="journal-search">
          <FiSearch size={16} aria-hidden="true" />
          <input value={q} onChange={e => search(e.target.value)} placeholder="Search the blog" aria-label="Search the blog" />
        </label>
      </header>

      {error && (
        <div className="journal-empty">
          <p>We couldn't load the blog. {error}</p>
          <button type="button" className="btn btn--ghost" onClick={load}><FiRefreshCw size={15} /> Try again</button>
        </div>
      )}

      {!posts && !error && (
        <div className="journal-grid" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}><div className="skeleton" style={{ aspectRatio: '16/9', borderRadius: 'var(--radius)' }} /><div className="skeleton" style={{ height: 18, width: '80%', marginTop: 14 }} /></div>
          ))}
        </div>
      )}

      {posts && posts.length === 0 && !error && (
        <div className="journal-empty">
          <p>{q ? `Nothing in the blog matches "${q}".` : 'No articles yet. New ones will appear here.'}</p>
          {q && <button type="button" className="btn btn--ghost" onClick={() => search('')}>Clear search</button>}
        </div>
      )}

      {posts && posts.length > 0 && (q ? (
        <section aria-label="Search results">
          <p className="journal-section-label">{posts.length} {posts.length === 1 ? 'article' : 'articles'}</p>
          <div className="journal-grid">{posts.map(post => <StoryCard key={post.id} post={post} />)}</div>
        </section>
      ) : (
        <>
          <FeaturedStory post={featured} />
          {rest.length > 0 && (
            <section aria-labelledby="latest-heading">
              <h2 id="latest-heading" className="journal-section-label">Latest</h2>
              <div className="journal-grid">{rest.map(post => <StoryCard key={post.id} post={post} />)}</div>
            </section>
          )}
        </>
      ))}

      <p className="journal-foot">Selling on Scorpio? <Link to="/dashboard/blog">Write for the blog</Link></p>
    </div>
  );
}
