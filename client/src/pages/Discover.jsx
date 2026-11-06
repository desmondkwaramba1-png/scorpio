import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiSearch, FiCompass } from 'react-icons/fi';
import ProductCard from '../components/ProductCard.jsx';
import { ACTIVE_CATEGORIES, EBOOKS_ONLY } from '../lib/launchScope.js';
import { useSEO } from '../lib/seo';
import { SITE_ORIGIN } from '../lib/site.js';
import { api } from '../lib/api';

const TYPES = [
  { value: '', label: 'All' },
  { value: 'single', label: 'Single item' },
  { value: 'serial', label: 'Serial' }
];
const PAGE_SIZE = 24;

function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton" style={{ aspectRatio: '4/3' }} />
      <div style={{ padding: 14 }}>
        <div className="skeleton" style={{ height: 14, width: '80%', marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 12, width: '50%', marginBottom: 14 }} />
        <div className="skeleton" style={{ height: 16, width: '35%' }} />
      </div>
    </div>
  );
}

export default function Discover() {
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const requestGeneration = useRef(0);

  const type = params.get('type') || '';
  const q = params.get('q') || '';
  const sort = params.get('sort') || '';
  const category = params.get('category') || '';

  useEffect(() => {
    const requestId = ++requestGeneration.current;
    let active = true;
    const qs = new URLSearchParams();
    if (type) qs.set('type', type);
    if (q) qs.set('q', q);
    if (sort) qs.set('sort', sort);
    if (category) qs.set('category', category);
    qs.set('limit', String(PAGE_SIZE));
    setProducts(null);
    setError(null);
    setHasMore(false);
    setLoadingMore(false);
    const timer = setTimeout(() => {
      api.get(`/api/products?${qs.toString()}`)
        .then(batch => {
          if (!active || requestGeneration.current !== requestId) return;
          setProducts(batch);
          setHasMore(batch.length === PAGE_SIZE);
        })
        .catch(err => {
          if (active && requestGeneration.current === requestId) setError(err.message);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [type, q, sort, category]);

  async function loadMore() {
    if (loadingMore || !hasMore || !products) return;
    const requestId = requestGeneration.current;
    const qs = new URLSearchParams();
    if (type) qs.set('type', type);
    if (q) qs.set('q', q);
    if (sort) qs.set('sort', sort);
    if (category) qs.set('category', category);
    qs.set('limit', String(PAGE_SIZE));
    qs.set('offset', String(products.length));
    setLoadingMore(true);
    try {
      const batch = await api.get(`/api/products?${qs.toString()}`);
      if (requestGeneration.current !== requestId) return;
      setProducts(current => [...current, ...batch]);
      setHasMore(batch.length === PAGE_SIZE);
    } catch (err) {
      if (requestGeneration.current === requestId) setError(err.message);
    } finally {
      if (requestGeneration.current === requestId) setLoadingMore(false);
    }
  }

  function updateParam(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next);
  }

  useSEO({
    title: q
      ? `"${q}", Search results | SCORPIO`
      : 'Discover Ebooks, Courses & Templates, SCORPIO Marketplace',
    description: 'Browse ebooks, guides, templates, and online courses from real Zimbabwean creators on SCORPIO, pay instantly with EcoCash.',
    url: `${SITE_ORIGIN}/discover`
  });

  return (
    <div className="discover-page wrap">
      <header className="discover-heading">
        <h1>Discover</h1>
        <p className="discover-heading__intro">
          {EBOOKS_ONLY ? 'Ebooks, guides, templates, and courses from people who actually know the subject.' : 'Products from creators across Zimbabwe.'}
        </p>
      </header>

      <section className="discover-toolbar" aria-label="Search and filter products">
        <label className="input-icon discover-search">
          <FiSearch size={18} />
          <input
            value={q} onChange={e => updateParam('q', e.target.value)}
            placeholder="Search ebooks, courses, templates..."
            aria-label="Search products"
          />
        </label>

        <div className="discover-toolbar__row">
          {ACTIVE_CATEGORIES.length > 1 && (
            <div className="discover-categories" aria-label="Product category">
              <button
                onClick={() => updateParam('category', '')}
                className={`category-chip${category === '' ? ' category-chip--active' : ''}`}
              >All</button>
              {ACTIVE_CATEGORIES.map(item => (
                <button
                  key={item.value}
                  onClick={() => updateParam('category', item.value)}
                  className={`category-chip${category === item.value ? ' category-chip--active' : ''}`}
                >{item.label}</button>
              ))}
            </div>
          )}
          <div className="discover-toolbar__options">
            <select value={type} onChange={e => updateParam('type', e.target.value)} className="discover-sort" aria-label="Product format">
              {TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select value={sort} onChange={e => updateParam('sort', e.target.value)} className="discover-sort" aria-label="Sort by">
              <option value="">Newest</option>
              <option value="popular">Popular</option>
              <option value="bestselling">Best selling</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </div>
        </div>
        {products && !error && <p className="discover-count">{hasMore ? 'Showing ' : ''}{products.length} {products.length === 1 ? 'product' : 'products'}</p>}
      </section>

      {error && <p className="error-text">{error}</p>}

      {!products && !error && (
        <div className="product-grid">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {products && products.length === 0 && (
        <div className="empty-state">
          <strong>No products match yet.</strong>
          Try a different search or clear your filters.
        </div>
      )}

      {products && products.length > 0 && (
        <div className="product-grid">
          {products.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
      {products && hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0 40px' }}>
          <button className="btn btn--ghost" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
