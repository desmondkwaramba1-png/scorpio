import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiPlay, FiChevronRight, FiSearch, FiSmartphone, FiDownload, FiCheckCircle } from 'react-icons/fi';
import ReelViewer from '../components/ReelViewer.jsx';
import StoryCard from '../components/StoryCard.jsx';
import { ACTIVE_CATEGORIES, EBOOKS_ONLY } from '../lib/launchScope.js';
import { formatMoney } from '../lib/money';
import { useAuth } from '../context/AuthContext.jsx';

// Marks the first visit; other screens read this flag.
const HERO_SEEN_KEY = 'scorpio_seen_marketplace_pitch';

function priceLabel(p) {
  if (p.promo_active) return formatMoney(p.discounted_price_minor, p.currency);
  if (p.price_minor === 0) return 'Free';
  return (p.pay_what_you_want ? 'From ' : '') + formatMoney(p.price_minor, p.currency);
}

function Cover({ product: p }) {
  return p.cover_path
    ? <img src={p.cover_path} alt="" loading="lazy" />
    : <span className="tile__initial">{p.title.charAt(0).toUpperCase()}</span>;
}

// One product in a row: cover shown whole, then title, creator and price.
function ProductTile({ product: p }) {
  return (
    <Link to={`/@${p.creator_handle}/${p.slug}`} className="tile">
      <span className="tile__cover">
        <Cover product={p} />
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

// A card with four products in a 2x2 grid, the way big stores open their home page.
function QuadCard({ title, link, products, linkLabel = 'See more' }) {
  const four = (products || []).slice(0, 4);
  if (four.length < 2) return null;
  return (
    <section className="quad">
      <h2 className="quad__title">{title}</h2>
      <div className="quad__grid">
        {four.map(p => (
          <Link key={p.id} to={`/@${p.creator_handle}/${p.slug}`} className="quad__item">
            <span className="quad__cover"><Cover product={p} /></span>
            <span className="quad__name">{p.title}</span>
          </Link>
        ))}
      </div>
      <Link to={link} className="quad__link">{linkLabel}</Link>
    </section>
  );
}

function Panel({ title, link, linkLabel = 'See all', children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel__head">
        <h2 className="panel__title">{title}</h2>
        {link && <Link to={link} className="panel__link">{linkLabel} <FiChevronRight size={15} aria-hidden="true" /></Link>}
      </div>
      {children}
    </section>
  );
}

function ProductRow({ title, link, products }) {
  if (!products || products.length < 2) return null;
  return (
    <Panel title={title} link={link}>
      <div className="row">{products.slice(0, 12).map(p => <ProductTile key={p.id} product={p} />)}</div>
    </Panel>
  );
}

const STEPS = [
  { icon: FiSearch, title: 'Find what you need', text: 'Guides, templates and courses from people who know the subject.' },
  { icon: FiSmartphone, title: 'Pay with EcoCash', text: 'Confirm on your phone. No card needed.' },
  { icon: FiDownload, title: 'Download straight away', text: 'Files stay in your account, with 5 days of buyer protection.' },
];

function Creators({ creators, reelsByCreator, onPlay }) {
  if (!creators || !creators.length) return null;
  return (
    <Panel title="Meet the creators" link="/creators">
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
    </Panel>
  );
}

export default function Marketplace() {
  const { user, creator, loading: authLoading } = useAuth();
  const [trending, setTrending] = useState(null);
  const [fresh, setFresh] = useState(null);
  const [blogPosts, setBlogPosts] = useState(null);
  const [byCategory, setByCategory] = useState({});
  const [spotlightCreators, setSpotlightCreators] = useState(null);
  const [reelsByCreator, setReelsByCreator] = useState({});
  const [viewingReels, setViewingReels] = useState(null);

  useEffect(() => { try { localStorage.setItem(HERO_SEEN_KEY, '1'); } catch { /* private mode */ } }, []);

  // Everything the page needs, applied together so it settles in one layout pass.
  useEffect(() => {
    const cats = ACTIVE_CATEGORIES.length > 1 ? ACTIVE_CATEGORIES : [];
    const get = url => fetch(url).then(r => r.json()).catch(() => []);
    const list = v => (Array.isArray(v) ? v : []);
    Promise.all([
      get('/api/products?sort=popular&limit=12'),
      get('/api/products?limit=16'),
      get('/api/creators?limit=14'),
      get('/api/reels?limit=60'),
      get('/api/blog?limit=3'),
      Promise.all(cats.map(c => get(`/api/products?category=${c.value}&limit=4`))),
    ]).then(([popular, newest, creators, reels, blog, catResults]) => {
      popular = list(popular); newest = list(newest);
      setTrending(popular);
      // With little like activity, "popular" and "newest" overlap; don't show the same products twice.
      const seen = new Set(popular.map(p => p.id));
      const unseen = newest.filter(p => !seen.has(p.id));
      setFresh(unseen.length >= 4 ? unseen : newest);
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

  const sellHref = user ? '/onboarding' : '/login?role=creator';

  return (
    <div className="home">
      <header className="banner">
        <div className="wrap banner__inner">
          <p className="banner__kicker">Made in Zimbabwe · Paid with EcoCash</p>
          <h1 className="banner__title">
            {EBOOKS_ONLY ? <>Learn it from someone who has <span className="banner__accent">done it.</span></> : "Zimbabwe's marketplace for digital products."}
          </h1>
          <p className="banner__sub">Guides, templates and courses from Zimbabwean creators.</p>
          <div className="banner__actions">
            <Link to="/discover" className="btn banner__primary">Shop all products</Link>
            {!authLoading && !creator && <Link to={sellHref} className="btn banner__secondary">Start selling</Link>}
          </div>
          <ul className="banner__trust">
            <li><FiCheckCircle size={15} aria-hidden="true" /> Pay with EcoCash</li>
            <li><FiCheckCircle size={15} aria-hidden="true" /> Instant download</li>
            <li><FiCheckCircle size={15} aria-hidden="true" /> 5-day buyer protection</li>
          </ul>
        </div>
      </header>

      <div className="wrap home__body">
        <div className="quads">
          <QuadCard title="Trending now" link="/discover?sort=popular" products={trending} />
          {ACTIVE_CATEGORIES.length > 1 && ACTIVE_CATEGORIES.map(c => (
            <QuadCard key={c.value} title={c.label} link={`/discover?category=${c.value}`} products={byCategory[c.value]} />
          ))}
        </div>

        <ProductRow title="Best sellers" link="/discover?sort=popular" products={trending} />
        <ProductRow title="New arrivals" link="/discover" products={fresh} />

        <Panel title="How Scorpio works">
          <ol className="steps">
            {STEPS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="step">
                <span className="step__icon"><Icon size={20} aria-hidden="true" /></span>
                <span>
                  <h3 className="step__title">{title}</h3>
                  <p className="step__text">{text}</p>
                </span>
              </li>
            ))}
          </ol>
        </Panel>

        <Creators creators={spotlightCreators} reelsByCreator={reelsByCreator} onPlay={setViewingReels} />

        {blogPosts && blogPosts.length > 0 && (
          <Panel title="From the blog" link="/blog" linkLabel="All articles">
            <div className="home-stories">{blogPosts.slice(0, 3).map(post => <StoryCard key={post.id} post={post} />)}</div>
          </Panel>
        )}

        {!authLoading && !creator && (
          <section className="sell-panel">
            <div>
              <h2 className="sell-panel__title">Turn what you know into income</h2>
              <p className="sell-panel__text">Open a storefront in minutes. No monthly fee. Paid out to your EcoCash.</p>
            </div>
            <Link to={sellHref} className="btn btn--primary">Start selling</Link>
          </section>
        )}
      </div>

      {viewingReels && <ReelViewer reels={viewingReels} onClose={() => setViewingReels(null)} />}
    </div>
  );
}
