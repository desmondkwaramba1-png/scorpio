import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FiShare2, FiCheck, FiClock, FiArrowLeft, FiArrowRight } from 'react-icons/fi';
import { api } from '../lib/api';
import { useSEO } from '../lib/seo';
import { SITE_ORIGIN } from '../lib/site';
import { shareOrCopy } from '../lib/share';
import { renderMarkdown, readingTime, plainTextExcerpt } from '../lib/markdown';

function formatDate(sqliteDatetimeOrIso) {
  const raw = sqliteDatetimeOrIso.includes('T') ? sqliteDatetimeOrIso : sqliteDatetimeOrIso.replace(' ', 'T') + 'Z';
  return new Date(raw).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function BlogPost() {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [error, setError] = useState(null);
  const [more, setMore] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPost(null);
    setError(null);
    setMore(null);
    api.get(`/api/blog/${slug}`)
      .then(setPost)
      .catch(() => setError('This post could not be found. The link may be wrong or it may have been unpublished.'));
    api.get('/api/blog?limit=4').then(setMore).catch(() => setMore([]));
  }, [slug]);

  // Unconditional, before any early return below — same reasoning
  // Product.jsx's own useSEO call documents: a hook can never sit after a
  // return that only fires on some renders.
  const postUrl = post ? `${SITE_ORIGIN}/blog/${post.slug}` : undefined;
  useSEO({
    title: post ? `${post.title} | SCORPIO Blog` : undefined,
    description: post ? (post.excerpt || plainTextExcerpt(post.body_markdown)) : undefined,
    image: post?.cover_path,
    url: postUrl,
    jsonLd: post ? {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.excerpt || plainTextExcerpt(post.body_markdown),
      image: post.cover_path ? [post.cover_path] : undefined,
      datePublished: post.published_at,
      dateModified: post.updated_at || post.published_at,
      author: post.creator_handle ? { '@type': 'Person', name: post.author_name } : { '@type': 'Organization', name: post.author_name },
      publisher: { '@type': 'Organization', name: 'SCORPIO' },
      mainEntityOfPage: postUrl
    } : undefined
  });

  async function share() {
    const method = await shareOrCopy({ title: post.title, text: post.excerpt || post.title, url: window.location.href });
    if (method === 'copy_link') {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  if (error) {
    return (
      <div className="wrap center-page" style={{ padding: 20 }}>
        <p className="error-text">{error}</p>
        <Link to="/blog" style={{ display: 'inline-block', marginTop: 16 }}>&larr; Back to the blog</Link>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="wrap" style={{ padding: '48px 20px 80px', maxWidth: '72ch' }}>
        <div className="skeleton" style={{ height: 320, borderRadius: 'var(--radius)', marginBottom: 28 }} />
        <div className="skeleton" style={{ height: 30, width: '80%', marginBottom: 14 }} />
        <div className="skeleton" style={{ height: 14, width: '40%', marginBottom: 30 }} />
        <div className="skeleton" style={{ height: 14, width: '100%', marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 14, width: '95%', marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 14, width: '90%' }} />
      </div>
    );
  }

  const others = (more || []).filter(p => p.slug !== post.slug).slice(0, 3);

  return (
    <article className="wrap" style={{ padding: '32px 20px 80px', maxWidth: '72ch' }}>
      <Link to="/blog" className="blog-post__back"><FiArrowLeft size={14} /> Back to the blog</Link>

      {post.cover_path && (
        <div className="blog-post__cover">
          <div className="blog-post__cover-backdrop" style={{ backgroundImage: `url(${post.cover_path})` }} />
          <div className="blog-post__cover-image" style={{ backgroundImage: `url(${post.cover_path})` }} />
        </div>
      )}

      <h1 className="blog-post__title">{post.title}</h1>
      <p className="blog-post__meta">
        {post.creator_handle ? <Link to={`/@${post.creator_handle}`} style={{ color: 'inherit', fontWeight: 600 }}>@{post.creator_handle}</Link> : post.author_name}
        {' '}&middot; {formatDate(post.published_at)}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
          &middot; <FiClock size={13} /> {readingTime(post.body_markdown)} min read
        </span>
      </p>

      <div className="blog-post__body" dangerouslySetInnerHTML={{ __html: renderMarkdown(post.body_markdown) }} />

      {/* The actual content-to-commerce link the whole point of letting
          creators write for the blog rests on (see routes/blog.js's
          featured_product_id) — a real, specific "want this?" card, not
          a generic "check out my store" plug. */}
      {post.featured_product_slug && (
        <Link
          to={`/@${post.featured_product_creator_handle}/${post.featured_product_slug}`}
          className="card card--pad"
          style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 16, textDecoration: 'none' }}
        >
          <div style={{
            width: 64, height: 64, borderRadius: 'var(--radius-sm)', flexShrink: 0,
            background: post.featured_product_cover ? `url(${post.featured_product_cover}) center/cover` : 'var(--brand-tint)'
          }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="muted" style={{ fontSize: '.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Want this?</p>
            <p style={{ fontWeight: 600 }}>{post.featured_product_title}</p>
          </div>
          <FiArrowRight size={18} style={{ flexShrink: 0, color: 'var(--muted)' }} />
        </Link>
      )}

      <button onClick={share} className="btn btn--ghost" style={{ marginTop: 32 }}>
        {copied ? <><FiCheck size={15} /> Link copied</> : <><FiShare2 size={15} /> Share this post</>}
      </button>

      {others.length > 0 && (
        <div style={{ marginTop: 56, paddingTop: 32, borderTop: '1px solid var(--line)' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: 18 }}>More from the blog</h2>
          <div style={{ display: 'grid', gap: 16 }}>
            {others.map(p => (
              <Link key={p.id} to={`/blog/${p.slug}`} className="blog-post__more-link">
                <div
                  className="blog-post__more-cover"
                  style={p.cover_path ? { backgroundImage: `url(${p.cover_path})` } : undefined}
                />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</p>
                  <p className="muted" style={{ fontSize: '.82rem' }}>{formatDate(p.published_at)}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
