import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FiShare2, FiCheck, FiArrowLeft, FiArrowRight } from 'react-icons/fi';
import { api } from '../lib/api';
import { useSEO } from '../lib/seo';
import { SITE_ORIGIN } from '../lib/site';
import { shareOrCopy } from '../lib/share';
import { renderMarkdown, plainTextExcerpt } from '../lib/markdown';
import StoryCard, { StoryMeta, stripLeadingTitle } from '../components/StoryCard.jsx';

// A thin line under the nav showing how far through the article you are.
function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  return <div className="article-progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>;
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
    window.scrollTo(0, 0);
    api.get(`/api/blog/${slug}`)
      .then(setPost)
      .catch(() => setError('This article could not be found. The link may be wrong, or it may have been unpublished.'));
    api.get('/api/blog?limit=4').then(setMore).catch(() => setMore([]));
  }, [slug]);

  // Hooks stay above every early return.
  const body = post ? stripLeadingTitle(post.body_markdown) : '';
  const summary = post ? (post.excerpt || plainTextExcerpt(body, 200)) : undefined;
  const postUrl = post ? `${SITE_ORIGIN}/blog/${post.slug}` : undefined;
  useSEO({
    title: post ? `${post.title} | SCORPIO Blog` : undefined,
    description: summary,
    image: post?.cover_path,
    url: postUrl,
    jsonLd: post ? {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: summary,
      image: post.cover_path ? [post.cover_path] : undefined,
      datePublished: post.published_at,
      dateModified: post.updated_at || post.published_at,
      author: post.creator_handle ? { '@type': 'Person', name: post.author_name } : { '@type': 'Organization', name: post.author_name },
      publisher: { '@type': 'Organization', name: 'SCORPIO' },
      mainEntityOfPage: postUrl
    } : undefined
  });

  async function share() {
    const method = await shareOrCopy({ title: post.title, text: summary || post.title, url: window.location.href });
    if (method === 'copy_link') {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  if (error) {
    return (
      <div className="not-found wrap">
        <h1>Article not found</h1>
        <p className="muted">{error}</p>
        <div className="not-found__actions"><Link to="/blog" className="btn btn--cta">Back to the blog</Link></div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="article wrap" aria-hidden="true">
        <div className="skeleton" style={{ height: 14, width: '30%', marginBottom: 18 }} />
        <div className="skeleton" style={{ height: 40, width: '90%', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 40, width: '60%', marginBottom: 28 }} />
        <div className="skeleton" style={{ aspectRatio: '16/9', borderRadius: 'var(--radius)' }} />
      </div>
    );
  }

  const author = post.creator_handle ? `@${post.creator_handle}` : post.author_name;
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const others = (more || []).filter(p => p.slug !== post.slug).slice(0, 3);

  return (
    <>
      <ReadingProgress />
      <article className="article">
        <header className="article-head wrap">
          <Link to="/blog" className="article-back"><FiArrowLeft size={15} /> Blog</Link>
          <StoryMeta post={post} words={words} />
          <h1 className="article-title">{post.title}</h1>
          {summary && <p className="article-standfirst">{summary}</p>}
          <p className="article-byline">
            <span className="article-byline__avatar" style={post.creator_avatar ? { backgroundImage: `url(${post.creator_avatar})` } : undefined}>
              {!post.creator_avatar && author.replace('@', '').charAt(0).toUpperCase()}
            </span>
            {post.creator_handle ? <Link to={`/@${post.creator_handle}`}>{author}</Link> : <span>{author}</span>}
          </p>
        </header>

        {post.cover_path && (
          <figure className="article-cover wrap"><img src={post.cover_path} alt="" /></figure>
        )}

        <div className="article-body wrap" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />

        <footer className="article-foot wrap">
          {post.featured_product_slug && (
            <Link to={`/@${post.featured_product_creator_handle}/${post.featured_product_slug}`} className="article-product">
              <span className="article-product__cover" style={post.featured_product_cover ? { backgroundImage: `url(${post.featured_product_cover})` } : undefined} />
              <span className="article-product__text">
                <span className="article-product__label">Mentioned in this article</span>
                <span className="article-product__title">{post.featured_product_title}</span>
              </span>
              <FiArrowRight size={18} aria-hidden="true" />
            </Link>
          )}
          <button type="button" onClick={share} className="btn btn--ghost">
            {copied ? <><FiCheck size={15} /> Link copied</> : <><FiShare2 size={15} /> Share this article</>}
          </button>
        </footer>
      </article>

      {others.length > 0 && (
        <section className="journal wrap article-more" aria-labelledby="more-heading">
          <h2 id="more-heading" className="journal-section-label">More from the blog</h2>
          <div className="journal-grid">{others.map(p => <StoryCard key={p.id} post={p} />)}</div>
        </section>
      )}
    </>
  );
}
