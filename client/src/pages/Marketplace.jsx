import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiPlay, FiSearch, FiSmartphone, FiDownload } from 'react-icons/fi';
import CompactProductCard from '../components/CompactProductCard.jsx';
import ReelViewer from '../components/ReelViewer.jsx';
import { ACTIVE_CATEGORIES, EBOOKS_ONLY } from '../lib/launchScope.js';
import StoryCard from '../components/StoryCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Marks the first visit; other screens read this flag.
const HERO_SEEN_KEY = 'scorpio_seen_marketplace_pitch';

// The "meet your creators" tray, a story-bubble row of who's actually
// behind the listings. A creator with reels gets a ring + play glyph and
// opens the ReelViewer scoped to just their videos; a creator with none
// yet is still a real, useful tap, it just goes straight to their
// storefront instead of a dead-end "no videos" state.
// Real Lighthouse run traced the page's single biggest layout-shift score
// to this: while spotlightCreators is still null (the fetch hasn't
// resolved yet), the old code returned null here, zero height, so the
// moment real data arrived, this whole row popped into existence and
// shoved "Shop by category" (and everything below it) down in one jump.
// A skeleton sized to the real row reserves that space from first paint
// instead, once creators is a genuinely empty array (fetched, really
// nothing to show) it collapses to null same as before, that's not a
// loading state, there's really nothing coming.
function SectionHead({ title, link, label = 'See all' }) {
  return (
    <div className="home-head">
      <h2 className="home-head__title">{title}</h2>
      {link && <Link to={link} className="home-head__link">{label}</Link>}
    </div>
  );
}

function CreatorSpotlightSkeleton() {
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

function CreatorSpotlight({ creators, reelsByCreator, onPlay }) {
  if (creators === null) return <CreatorSpotlightSkeleton />;
  if (!creators || creators.length === 0) return null;
  return (
    <section className="home-section wrap">
      <SectionHead title="Meet the creators" link="/creators" />
      <div className="rail-wrap">
        <div className="creator-spotlight">
          {creators.map(c => {
            const reels = reelsByCreator[c.handle];
            const avatar = (
              <span
                className="creator-spotlight__avatar"
                style={{ background: c.avatar_path ? `url(${c.avatar_path}) center/cover` : 'var(--accent)' }}
              >
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
      </div>
    </section>
  );
}

function BlogSection({ posts }) {
  if (!posts || posts.length === 0) return null;
  return (
    <section className="home-section home-section--tint">
      <div className="wrap">
        <SectionHead title="From the blog" link="/blog" label="All articles" />
        <div className="home-stories">
          {posts.slice(0, 3).map(post => <StoryCard key={post.id} post={post} />)}
        </div>
      </div>
    </section>
  );
}

function Rail({ title, link, products }) {
  // A single card in a row built for a horizontal scroll of many reads
  // as broken, not curated — a lonely card floating in a full-width
  // carousel track with nothing to scroll to. Below 2, that category/row
  // just isn't ready to stand on its own on the homepage yet; the product
  // itself is still fully reachable from Discover.
  if (!products || products.length < 2) return null;
  return (
    <section className="home-section wrap">
      <SectionHead title={title} link={link} />
      <div className="rail-wrap">
        <div className="rail home-rail">
          {products.map(p => <CompactProductCard key={p.id} product={p} />)}
        </div>
      </div>
    </section>
  );
}

function ProductGrid({ title, link, products }) {
  if (!products || products.length < 2) return null;
  return (
    <section className="home-section wrap">
      <SectionHead title={title} link={link} />
      <div className="home-grid">
        {products.slice(0, 8).map(p => <CompactProductCard key={p.id} product={p} />)}
      </div>
    </section>
  );
}

const STEPS = [
  { icon: FiSearch, title: 'Find it', text: 'Guides, templates and courses made by people who know the subject.' },
  { icon: FiSmartphone, title: 'Pay with EcoCash', text: 'Confirm on your phone. No card needed.' },
  { icon: FiDownload, title: 'Download straight away', text: 'Your files stay in your account, with 5 days of buyer protection.' },
];

function HowItWorks() {
  return (
    <section className="home-section wrap" aria-labelledby="how-heading">
      <h2 id="how-heading" className="home-head__title">How it works</h2>
      <ol className="home-steps">
        {STEPS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="home-step">
            <span className="home-step__icon"><Icon size={18} aria-hidden="true" /></span>
            <h3 className="home-step__title">{title}</h3>
            <p className="home-step__text">{text}</p>
          </li>
        ))}
      </ol>
    </section>
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

  // The actual persistent write, isolated to an effect where a side effect
  // belongs. Safe under StrictMode's dev-only double-invoke of effects too
  //, setting the same localStorage value twice is a no-op the second time.
  useEffect(() => {
    localStorage.setItem(HERO_SEEN_KEY, '1');
  }, []);

  // All of the homepage's initial data used to update state independently
  // as each fetch resolved, up to 6 separate re-renders (and a real
  // browser layout pass each time) instead of one. A real Lighthouse run
  // traced a chunk of the "Style & Layout" main-thread cost dragging down
  // Speed Index straight to this — same requests, same waterfall (a slow
  // category still doesn't hold up the rest, they're still independent
  // fetches), just applied to state together in one batch once everything
  // that's coming back is actually back.
  useEffect(() => {
    const categoryEntries = ACTIVE_CATEGORIES.length > 1 ? ACTIVE_CATEGORIES : [];

    Promise.all([
      fetch('/api/products?sort=popular&limit=8').then(r => r.json()).catch(() => []),
      fetch('/api/products?limit=8').then(r => r.json()).catch(() => []),
      fetch('/api/creators?limit=14').then(r => r.json()).catch(() => []),
      fetch('/api/reels?limit=60').then(r => r.json()).catch(() => []),
      fetch('/api/blog?limit=3').then(r => r.json()).catch(() => []),
      Promise.all(categoryEntries.map(c =>
        fetch(`/api/products?category=${c.value}&limit=6`).then(r => r.json()).catch(() => [])
      ))
    ]).then(([popular, newest, creators, reels, blog, categoryResults]) => {
      setTrending(popular);
      // With little to no like activity yet, "popular" and "newest" can
      // return the exact same products in the exact same order, the tie
      // in like_count breaks on created_at DESC either way. Drop anything
      // already shown in Trending so New Arrivals isn't just a rerun of it.
      const trendingIds = new Set(popular.map(p => p.id));
      setFresh(newest.filter(p => !trendingIds.has(p.id)));

      setSpotlightCreators(creators);
      setBlogPosts(blog);

      // Recent reels across everyone, grouped by creator handle client-
      // side , one request instead of asking "does this creator have
      // reels?" once per avatar in the tray. A creator absent from this
      // batch just means no reels among the most recent ones, not
      // "definitely none", an acceptable trade for one fetch instead of N.
      const grouped = {};
      for (const r of reels) (grouped[r.creator_handle] ||= []).push(r);
      setReelsByCreator(grouped);

      // One curated row per category, Amazon-homepage style, rows for
      // categories nobody's listed in yet just never appear (Rail already
      // hides on an empty array). Skipped entirely with a single active
      // category, it'd just duplicate New arrivals below.
      if (categoryEntries.length > 0) {
        const byCategory = {};
        categoryEntries.forEach((c, i) => { byCategory[c.value] = categoryResults[i]; });
        setByCategory(byCategory);
      }
    });
  }, []);

  return (
    <div className="home">
      <header className="home-hero">
        <div className="wrap">
          <h1 className="home-hero__title">
            {EBOOKS_ONLY ? 'Guides, templates and courses from Zimbabwean creators.' : "Zimbabwe's marketplace for digital products."}
          </h1>
          <p className="home-hero__sub">Pay with EcoCash and download straight away.</p>
          <div className="home-hero__actions">
            <Link to="/discover" className="btn btn--cta">Browse products</Link>
            {!authLoading && !creator && (
              <Link to={user ? '/onboarding' : '/login?role=creator'} className="btn home-hero__secondary">Sell on Scorpio</Link>
            )}
          </div>
        </div>
      </header>

      {ACTIVE_CATEGORIES.length > 1 && (
        <nav className="home-cats" aria-label="Categories">
          <div className="wrap home-cats__row">
            {ACTIVE_CATEGORIES.map(c => (
              <Link key={c.value} to={`/discover?category=${c.value}`} className="cat-link">{c.label}</Link>
            ))}
          </div>
        </nav>
      )}

      <Rail title="Trending" link="/discover?sort=popular" products={trending} />
      <HowItWorks />
      <ProductGrid title="New arrivals" link="/discover" products={fresh} />
      <CreatorSpotlight creators={spotlightCreators} reelsByCreator={reelsByCreator} onPlay={setViewingReels} />
      {ACTIVE_CATEGORIES.length > 1 && ACTIVE_CATEGORIES.map(c => (
        <Rail key={c.value} title={c.label} link={`/discover?category=${c.value}`} products={byCategory[c.value]} />
      ))}
      <BlogSection posts={blogPosts} />

      {!authLoading && !creator && (
        <section className="home-sell">
          <div className="wrap home-sell__inner">
            <h2 className="home-sell__title">Sell what you know</h2>
            <p className="home-sell__text">Open a storefront in minutes. No monthly fee. Paid out to your EcoCash.</p>
            <Link to={user ? '/onboarding' : '/login?role=creator'} className="btn btn--cta">Start selling</Link>
          </div>
        </section>
      )}

      {viewingReels && <ReelViewer reels={viewingReels} onClose={() => setViewingReels(null)} />}
    </div>
  );
}
