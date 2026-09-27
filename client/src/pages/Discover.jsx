import { useEffect, useState } from 'react';
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

  const type = params.get('type') || '';
  const q = params.get('q') || '';
  const sort = params.get('sort') || '';
  const category = params.get('category') || '';

  useEffect(() => {
    const qs = new URLSearchParams();
    if (type) qs.set('type', type);
    if (q) qs.set('q', q);
    if (sort) qs.set('sort', sort);
    if (category) qs.set('category', category);
    setProducts(null);
    setError(null);
    api.get(`/api/products?${qs.toString()}`)
      .then(setProducts)
      .catch(err => setError(err.message));
  }, [type, q, sort, category]);

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

      <section className="discover-toolbar" aria-label="Filter products">
        <div className="discover-filters">
          <label className="input-icon discover-search">
            <FiSearch size={16} />
            <input
              value={q} onChange={e => updateParam('q', e.target.value)}
              placeholder="Search products..."
              aria-label="Search products"
            />
          </label>
          <div className="discover-toolbar__selects">
            <select value={sort} onChange={e => updateParam('sort', e.target.value)} className="discover-sort" aria-label="Sort by">
              <option value="">Newest first</option>
              <option value="popular">Most popular</option>
              <option value="bestselling">Bestselling</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
            <select value={type} onChange={e => updateParam('type', e.target.value)} className="discover-sort" aria-label="Product format">
              {TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
        </div>

        {ACTIVE_CATEGORIES.length > 1 && (
          <div className="discover-toolbar__categories">
            <div className="category-chips" aria-label="Product category">
              <button
                onClick={() => updateParam('category', '')}
                className={`category-chip${category === '' ? ' category-chip--active' : ''}`}
              >All</button>
              {ACTIVE_CATEGORIES.map(item => (
                <button
                  key={item.value}
                  onClick={() => updateParam('category', item.value)}
                  className={`category-chip${category === item.value ? ' category-chip--active' : ''}`}
                >
                  <item.icon size={13} /> {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {products && !error && <p className="discover-count">{products.length} {products.length === 1 ? 'product' : 'products'}</p>}
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
    </div>
  );
}
