import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiPlay, FiSearch, FiArrowRight } from 'react-icons/fi';
import ReelViewer from '../components/ReelViewer.jsx';
import StoryCard from '../components/StoryCard.jsx';
import { ACTIVE_CATEGORIES, EBOOKS_ONLY } from '../lib/launchScope.js';
import { formatMoney } from '../lib/money';
import { useAuth } from '../context/AuthContext.jsx';

// Marks the first visit; other screens read this flag.
const HERO_SEEN_KEY = 'scorpio_seen_marketplace_pitch';

const CATEGORY_BLURBS = {
  ebooks: 'Read it tonight, use it tomorrow.',
  templates: 'Ready-made sheets, plans and checklists.',
  courses: 'Learn step by step, at your own pace.',
};

function priceLabel(p) {
  if (p.promo_active) return formatMoney(p.discounted_price_minor, p.currency);
  if (p.price_minor === 0) return 'Free';
  return (p.pay_what_you_want ? 'From ' : '') + formatMoney(p.price_minor, p.currency);
}

// A borderless product tile: the cover does the talking.
function ProductTile({ product: p }) {
  return (
    <Link to={`/@${p.creator_handle}/${p.slug}`} className="tile">
      <span className="tile__cover">
        {p.cover_path
          ? <img src={p.cover_path} alt="" loading="lazy" />
          : <span className="tile__initial">{p.title.charAt(0).toUpperCase()}</span>}
        {p.promo_active && <span className="tile__badge">{p.discount_percent}% off</span>}
      </span>
      <span className="tile__title">{p.title}</span>
      <span className="tile__by">{p.creator_name}</span>
      <span className="tile__price">
        {priceLabel(p)}
        {p.promo_active && <s>{formatMoney(p.price_minor, p.currency)}</s>}
      </span>
    </Link>
  );
}

function SectionHead({ title, link, label = 'View all' }) {
  return (
    <div className="home-head">
      <h2 className="home-head__title">{title}</h2>
      {link && <Link to={link} className="home-head__link">{label} <FiArrowRight size={14} aria-hidden="true" /></Link>}
    </div>
  );
}

function ProductSection({ title, link, products }) {
  if (products === null) {
    return (
      <section className="home-section wrap" aria-hidden="true">
        <SectionHead title={title} />
        <div className="tile-grid">
          {Array.from({ length: 4 }).map((_, i) => <div key={i}><div className="skeleton" style={{ aspectRatio: '1/1', borderRadius: 14 }} /><div className="skeleton" style={{ height: 14, width: '70%', marginTop: 12 }} /></div>)}
        </div>
      </section>
    );
  }
  if (!products || products.length < 2) return null;
  return (
    <section className="home-section wrap">
      <SectionHead title={title} link={link} />
      <div className="tile-grid">{products.slice(0, 8).map(p => <ProductTile key={p.id} product={p} />)}</div>
    </section>
  );
}

function Categories({ byCategory }) {
  if (ACTIVE_CATEGORIES.length < 2) return null;
  return (
    <section className="home-section wrap">
      <SectionHead title="Shop by category" />
      <div className="cat-tiles">
        {ACTIVE_CATEGORIES.map(c => {
          const covers = (byCategory[c.value] || []).filter(p => p.cover_path).slice(0, 3);
          const Icon = c.icon;
          return (
            <Link key={c.value} to={`/discover?category=${c.value}`} className="cat-tile">
              <span className="cat-tile__text">
                <span className="cat-tile__icon"><Icon size={18} aria-hidden="true" /></span>
                <span className="cat-tile__name">{c.label}</span>
                <span className="cat-tile__blurb">{CATEGORY_BLURBS[c.value] || 'Browse the collection.'}</span>
              </span>
              {covers.length > 0 && (
                <span className="cat-tile__covers" aria-hidden="true">
                  {covers.map(p => <span key={p.id} style={{ backgroundImage: `url(${p.cover_path})` }} />)}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

const STEPS = [
  { title: 'Find what you need', text: 'Guides, templates and courses from people who know the subject.' },
  { title: 'Pay with EcoCash', text: 'Confirm on your phone. No card needed.' },
  { title: 'Download straight away', text: 'Files stay in your account, with 5 days of buyer protection.' },
];

function HowItWorks() {
  return (
    <section className="home-section wrap" aria-labelledby="how-heading">
      <SectionHead title="How it works" />
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className="step">
            <span className="step__num">{String(i + 1).padStart(2, '0')}</span>
            <h3 className="step__title" id={i === 0 ? 'how-heading' : undefined}>{s.title}</h3>
            <p className="step__text">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Creators({ creators, reelsByCreator, onPlay }) {
  if (creators === null) {
    return (
      <section className="home-section wrap" aria-hidden="true">
        <SectionHead title="Meet the creators" />
        <div className="creator-spotlight">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="creator-spotlight__item">
              <span className="creator-spotlight__ring skeleton" style={{ border: 'none' }} />
              <span className="skeleton" style={{ width: 40, height: 19, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (!creators.length) return null;
  return (
    <section className="home-section wrap">
      <SectionHead title="Meet the creators" link="/creators" />
      <div className="creator-spotlight">
        {creators.map(c => {
          const reels = reelsByCreator[c.handle];
          const avatar = (
            <span className="creator-spotlight__avatar" style={{ background: c.avatar_path ? `url(${c.avatar_path}) center/cover` : 'var(--accent)' }}>
              {!c.avatar_path && c.name.charAt(0).toUpperCase()}
            </span>
          );
          return reels?.length ? (
            <button key={c.id} type="button" className="creator-spotlight__item" onClick={() => onPlay(reels)}>
              <span className="creator-spotlight__ring creator-spotlight__ring--has-reel">
                {avatar}
                <span className="creator-spotlight__play"><FiPlay size={10} /></span>
              </span>
              <span className="creator-spotlight__name">{c.name.split(' ')[0]}</span>
            </button>
          ) : (
            <Link key={c.id} to={`/@${c.handle}`} className="creator-spotlight__item">
              <span className="creator-spotlight__ring">{avatar}</span>
              <span className="creator-spotlight__name">{c.name.split(' ')[0]}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function BlogSection({ posts }) {
  if (!posts || posts.length === 0) return null;
  return (
    <section className="home-section wrap">
      <SectionHead title="From the blog" link="/blog" label="All articles" />
      <div className="home-stories">{posts.slice(0, 3).map(post => <StoryCard key={post.id} post={post} />)}</div>
    </section>
  );
}

export default function Marketplace() {
  const navigate = useNavigate();
  const { user, creator, loading: authLoading } = useAuth();
  const [q, setQ] = useState('');
  const [trending, setTrending] = useState(null);
  const [fresh, setFresh] = useState(null);
  const [blogPosts, setBlogPosts] = useState(null);
  const [byCategory, setByCategory] = useState({});
  const [spotlightCreators, setSpotlightCreators] = useState(null);
  const [reelsByCreator, setReelsByCreator] = useState({});
  const [viewingReels, setViewingReels] = useState(null);

  useEffect(() => { try { localStorage.setItem(HERO_SEEN_KEY, '1'); } catch { /* private mode */ } }, []);

  // Everything the page needs, applied in one state update so it settles in one layout pass.
  useEffect(() => {
    const cats = ACTIVE_CATEGORIES.length > 1 ? ACTIVE_CATEGORIES : [];
    const get = url => fetch(url).then(r => r.json()).catch(() => []);
    Promise.all([
      get('/api/products?sort=popular&limit=8'),
      get('/api/products?limit=12'),
      get('/api/creators?limit=14'),
      get('/api/reels?limit=60'),
      get('/api/blog?limit=3'),
      Promise.all(cats.map(c => get(`/api/products?category=${c.value}&limit=3`))),
    ]).then(([popular, newest, creators, reels, blog, catResults]) => {
      const list = v => (Array.isArray(v) ? v : []);
      popular = list(popular); newest = list(newest);
      setTrending(popular);
      // With little like activity, "popular" and "newest" overlap; don't show the same products twice.
      const seen = new Set(popular.map(p => p.id));
      setFresh(newest.filter(p => !seen.has(p.id)));
      setSpotlightCreators(list(creators));
      setBlogPosts(list(blog));
      const grouped = {};
      for (const r of list(reels)) (grouped[r.creator_handle] ||= []).push(r);
      setReelsByCreator(grouped);
      const map = {};
      cats.forEach((c, i) => { map[c.value] = list(catResults[i]); });
      setByCategory(map);
    });
  }, []);

  function search(e) {
    e.preventDefault();
    navigate(q.trim() ? `/discover?q=${encodeURIComponent(q.trim())}` : '/discover');
  }

  return (
    <div className="home">
      <header className="hero">
        <div className="wrap hero__inner">
          <p className="hero__kicker">Made in Zimbabwe · Paid with EcoCash</p>
          <h1 className="hero__title">
            {EBOOKS_ONLY ? 'Learn it from someone who has done it.' : "Zimbabwe's marketplace for digital products."}
          </h1>
          <p className="hero__sub">Guides, templates and courses from Zimbabwean creators. Pay with EcoCash and download straight away.</p>
          <form className="hero__search" role="search" onSubmit={search}>
            <FiSearch size={18} aria-hidden="true" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="What do you want to learn?" aria-label="Search products" />
            <button type="submit" className="btn btn--primary">Search</button>
          </form>
          {ACTIVE_CATEGORIES.length > 1 && (
            <p className="hero__popular">
              <span>Popular:</span>
              {ACTIVE_CATEGORIES.map(c => <Link key={c.value} to={`/discover?category=${c.value}`}>{c.label}</Link>)}
            </p>
          )}
        </div>
      </header>

      <ProductSection title="Trending now" link="/discover?sort=popular" products={trending} />
      <Categories byCategory={byCategory} />
      <ProductSection title="New arrivals" link="/discover" products={fresh} />
      <HowItWorks />
      <Creators creators={spotlightCreators} reelsByCreator={reelsByCreator} onPlay={setViewingReels} />
      <BlogSection posts={blogPosts} />

      {!authLoading && !creator && (
        <section className="wrap home-section">
          <div className="sell-panel">
            <div>
              <h2 className="sell-panel__title">Turn what you know into income</h2>
              <p className="sell-panel__text">Open a storefront in minutes. No monthly fee. Paid out to your EcoCash.</p>
            </div>
            <Link to={user ? '/onboarding' : '/login?role=creator'} className="btn btn--cta">Start selling</Link>
          </div>
        </section>
      )}

      {viewingReels && <ReelViewer reels={viewingReels} onClose={() => setViewingReels(null)} />}
    </div>
  );
}
