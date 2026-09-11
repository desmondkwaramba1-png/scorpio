import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiSearch, FiTrendingUp, FiClock, FiZap, FiUsers, FiChevronRight, FiPlay } from 'react-icons/fi';
import CompactProductCard from '../components/CompactProductCard.jsx';
import Seal from '../components/Seal.jsx';
import ReelViewer from '../components/ReelViewer.jsx';
import { ACTIVE_CATEGORIES, EBOOKS_ONLY } from '../lib/launchScope.js';

// The first-encounter moment (badge + pitch + Get Started) is a one-time
// thing, real the very first time someone lands here, dead weight on
// every visit after. localStorage (not sessionStorage, unlike the splash)
// so it's gone for good after the first real visit, not just the first tab.
// The buyer/seller choice itself lives on /login now (its "Create account"
// tab), not here, this is just the door into it. "Just browsing" dismisses
// inline within the same visit, no reload needed.
//
// hasSeenPitch is read-only on purpose, it must NOT also set the flag.
// StrictMode (see main.jsx) deliberately double-invokes useState's lazy
// initializer in dev to catch exactly an impure-initializer bug like that:
// the first call would set the flag and return true, then the second
// (discarded-and-rerun) call would see its own flag already set and return
// false, so the pitch would never show even on a genuine first visit. The
// actual "mark as seen" write happens once, safely, in the effect below.
const HERO_SEEN_KEY = 'scorpio_seen_marketplace_pitch';
function hasSeenPitch() {
  if (typeof window === 'undefined') return true;
  return !!localStorage.getItem(HERO_SEEN_KEY);
}

// One line of real "you want X, here it is" pitch per category, the
// Amazon-homepage trick of naming the row like a person would, not like a
// filter ("Guides & templates" the label vs. "Downloads worth having" the row).
const CATEGORY_TAGLINES = {
  ebooks: 'Books worth reading',
  templates: 'Downloads worth having',
  courses: 'Courses to level you up',
  music: 'Sounds worth your time',
  video: 'Video worth watching',
  design: 'Design that stands out',
  software: 'Tools built for you',
  photography: 'Shots worth a look',
  writing: 'Words worth reading',
  business: 'Grow your business',
  other: 'More worth discovering'
};

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
function CreatorSpotlightSkeleton() {
  return (
    <section className="section section--row wrap" aria-hidden="true">
      <div className="rail-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiUsers size={16} color="var(--green-glow)" />
          <h2 className="rail-head__title">Meet the creators</h2>
        </div>
      </div>
      <div className="rail-wrap">
        <div className="creator-spotlight">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="creator-spotlight__item">
              <span className="creator-spotlight__ring skeleton" style={{ border: 'none' }} />
              {/* Real .creator-spotlight__name is .78rem text on the
                  body's inherited line-height:1.5, a ~19px line box, not
                  the 12px this placeholder used to reserve. Measured via
                  a real Lighthouse desktop run: that 7px-per-item gap
                  appearing across the whole row the instant real creator
                  data replaced the skeleton was the single largest CLS
                  culprit on the page (score 0.119 of 0.121 total). */}
              <span className="skeleton" style={{ width: 40, height: 19, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CreatorSpotlight({ creators, reelsByCreator, onPlay }) {
  if (creators === null) return <CreatorSpotlightSkeleton />;
  if (!creators || creators.length === 0) return null;
  return (
    <section className="section section--row wrap">
      <div className="rail-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiUsers size={16} color="var(--green-glow)" />
          <h2 className="rail-head__title">Meet the creators</h2>
        </div>
        <Link to="/creators" className="rail-head__link">See all <FiChevronRight size={13} /></Link>
      </div>
      <div className="rail-wrap">
        <div className="creator-spotlight">
          {creators.map(c => {
            const reels = reelsByCreator[c.handle];
            const avatar = (
              <span
                className="creator-spotlight__avatar"
                style={{ background: c.avatar_path ? `url(${c.avatar_path}) center/cover` : 'var(--gold)' }}
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

function Rail({ title, icon: Icon, link, products }) {
  if (!products || products.length === 0) return null;
  return (
    <section className="section section--row wrap">
      <div className="rail-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {Icon && <Icon size={16} color="var(--green-glow)" />}
          <h2 className="rail-head__title">{title}</h2>
        </div>
        <Link to={link} className="rail-head__link">See all</Link>
      </div>
      <div className="rail-wrap">
        <div className="rail">
          {products.map(p => <CompactProductCard key={p.id} product={p} />)}
        </div>
      </div>
    </section>
  );
}

export default function Marketplace() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [showPitch, setShowPitch] = useState(() => !hasSeenPitch());
  const [trending, setTrending] = useState(null);
  const [fresh, setFresh] = useState(null);
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
      Promise.all(categoryEntries.map(c =>
        fetch(`/api/products?category=${c.value}&limit=6`).then(r => r.json()).catch(() => [])
      ))
    ]).then(([popular, newest, creators, reels, categoryResults]) => {
      setTrending(popular);
      // With little to no like activity yet, "popular" and "newest" can
      // return the exact same products in the exact same order, the tie
      // in like_count breaks on created_at DESC either way. Drop anything
      // already shown in Trending so New Arrivals isn't just a rerun of it.
      const trendingIds = new Set(popular.map(p => p.id));
      setFresh(newest.filter(p => !trendingIds.has(p.id)));

      setSpotlightCreators(creators);

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

  function submitSearch(e) {
    e.preventDefault();
    navigate(q ? `/discover?q=${encodeURIComponent(q)}` : '/discover');
  }

  return (
    <div>
      <header className={`shop-hero${showPitch ? '' : ' shop-hero--compact'}`}>
        <div className="wrap">
          {showPitch ? (
            <>
              {/* Real Lighthouse data traced LCP straight to these two: the
                  fade-in-up entrance animation (.6s + a staggered delay)
                  meant the browser doesn't count this text as "painted"
                  for Core Web Vitals purposes until it's actually visible,
                  not just in the DOM, over a second of pure animation cost
                  on exactly the content LCP measures. Left the animation
                  on the badge and CTA below, small elements, never the
                  LCP candidate, so the entrance still reads as polished. */}
              <span className="mono shop-hero__badge shop-hero__reveal" style={{ animationDelay: '.05s' }}><FiZap size={12} /> REAL CREATORS, REAL SKILLS</span>
              <h1 className="shop-hero__title">Turn what you know into income.</h1>
              <p className="shop-hero__sub">
                {EBOOKS_ONLY
                  ? "Guides, templates, and courses from people who've actually done the work, not scraped off the internet. Every file is checked before it goes live."
                  : "Real digital products from people who've actually done the work, not scraped off the internet. Every listing is checked before it goes live."}
              </p>
              <div className="shop-hero__actions shop-hero__reveal" style={{ animationDelay: '.35s' }}>
                <Link to="/login" className="btn btn--gold shop-hero__cta">Get started</Link>
                <button type="button" className="shop-hero__browse-btn" onClick={() => setShowPitch(false)}>
                  Just browsing <FiChevronRight size={14} />
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={submitSearch} className="shop-hero__search">
              {/* The full pitch above carries a real, visible <h1> — this
                  compact header (a returning visitor who already dismissed
                  it) showed none at all, a real page-has-heading-one fail
                  a screen reader user would hit on every repeat visit, not
                  just a first-time edge case. */}
              <h1 className="sr-only">SCORPIO, Zimbabwe's marketplace for ebooks, guides, templates and courses</h1>
              <FiSearch size={16} color="var(--muted)" />
              <input
                value={q} onChange={e => setQ(e.target.value)}
                placeholder={EBOOKS_ONLY ? 'Search guides, templates, courses...' : 'Search for ebooks, courses, music, templates...'}
              />
              <button type="submit" className="shop-hero__search-btn" aria-label="Search">
                <FiSearch size={18} />
              </button>
            </form>
          )}
        </div>
      </header>

      <CreatorSpotlight creators={spotlightCreators} reelsByCreator={reelsByCreator} onPlay={setViewingReels} />

      {ACTIVE_CATEGORIES.length > 1 && (
        <section className="category-band">
          <div className="section wrap">
            <div className="section__head">
              <p className="section__eyebrow mono">SHOP BY CATEGORY</p>
              <h2 className="section__title">Find what you're looking for.</h2>
            </div>
            <div className="category-grid">
              {ACTIVE_CATEGORIES.map(c => (
                <Link key={c.value} to={`/discover?category=${c.value}`} className="category-tile">
                  <span className="category-tile__icon"><c.icon /></span>
                  <span className="category-tile__label">{c.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <Rail title="Trending now" icon={FiTrendingUp} link="/discover?sort=popular" products={trending} />
      <Rail title="New arrivals" icon={FiClock} link="/discover" products={fresh} />

      {ACTIVE_CATEGORIES.length > 1 && ACTIVE_CATEGORIES.map(c => (
        <Rail
          key={c.value}
          title={CATEGORY_TAGLINES[c.value] || c.label}
          icon={c.icon}
          link={`/discover?category=${c.value}`}
          products={byCategory[c.value]}
        />
      ))}

      {/* Same rule as the hero pitch above: this is a first-encounter pitch
          ("here's the other path you could've picked"), not a standing
          fixture of the shop. A returning visitor already made that call ,
          re-pitching them "become a seller" every time they check the
          marketplace is exactly the repeat-visit clutter we cut the hero
          pitch for. */}
      {showPitch && (
        <section className="cta-band">
          <div className="wrap" style={{ textAlign: 'center' }}>
            <p className="mono hero__eyebrow">SELLING ON SCORPIO</p>
            <h2 className="section__title" style={{ margin: '0 auto 12px', maxWidth: '30ch', color: '#fff' }}>
              {EBOOKS_ONLY ? 'Know something worth teaching? Open your storefront in five minutes.' : 'Got something to sell? Open your storefront in five minutes.'}
            </h2>
            <p style={{ color: 'rgba(255,255,255,.68)', maxWidth: '46ch', margin: '0 auto 24px' }}>
              No website, no monthly fee. Get paid straight to your EcoCash.
            </p>
            <Link to="/login?role=creator" className="btn btn--gold">Start selling</Link>
          </div>
        </section>
      )}

      {viewingReels && <ReelViewer reels={viewingReels} onClose={() => setViewingReels(null)} />}
    </div>
  );
}
