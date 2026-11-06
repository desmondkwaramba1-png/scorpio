import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiClock, FiKey, FiSend } from 'react-icons/fi';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/money';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Drafts' }
];

export default function Products() {
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.get('/api/products/mine').then(setProducts).catch(err => setError(err.message));
  }, []);

  const filtered = products?.filter(p => filter === 'all' || p.status === filter) || [];
  const draftCount = products?.filter(p => p.status === 'draft').length || 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.5rem' }}>Your products</h1>
        <Link to="/dashboard/products/new" className="btn btn--primary btn--sm">New product</Link>
      </div>

      {products && products.length > 0 && (
        <div className="type-pills" style={{ marginBottom: 20 }}>
          {FILTERS.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`type-pill${filter === f.value ? ' type-pill--active' : ''}`}>
              {f.label}{f.value === 'draft' && draftCount > 0 ? ` (${draftCount})` : ''}
            </button>
          ))}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
      {products && products.length === 0 && (
        <div className="empty-state">
          <strong>No products yet.</strong>
          <Link to="/dashboard/products/new" style={{ color: 'var(--brand)', fontWeight: 600 }}>Create your first product</Link>
        </div>
      )}
      {products && products.length > 0 && filtered.length === 0 && (
        <div className="empty-state">
          <strong>No {filter} products.</strong>
        </div>
      )}

      {!products && !error && (
        <div className="product-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton" style={{ aspectRatio: '5/4' }} />
              <div style={{ padding: 14 }}>
                <div className="skeleton" style={{ height: 14, width: '80%', marginBottom: 10 }} />
                <div className="skeleton" style={{ height: 16, width: '35%' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="product-grid">
        {filtered.map(p => (
          <div key={p.id} className="product-card">
            <Link to={`/dashboard/products/${p.id}/edit`} style={{ display: 'contents' }}>
              <div
                className={`product-card__cover${p.cover_path ? '' : ' product-card__cover--empty'}`}
                style={p.cover_path ? { backgroundImage: `url(${p.cover_path})` } : undefined}
              >
                {!p.cover_path && p.title.charAt(0).toUpperCase()}
                <span className={`badge ${p.status === 'published' ? 'badge--success' : 'badge--neutral'}`}
                  style={{ position: 'absolute', top: 10, right: 10 }}>
                  {p.status === 'published' ? 'Published' : 'Draft'}
                </span>
                  {p.review_status === 'flagged' && (
                    <span className="badge badge--warning" title={p.flag_reason || undefined}>Under review: hidden from the store</span>
                  )}
              </div>
              <div className="product-card__body">
                <p className="product-card__title">{p.title}</p>
                <p className="mono product-card__price">{(p.price_minor === 0 ? 'Free' : formatMoney(p.price_minor, p.currency))}</p>

                {p.type === 'service' ? (
                  <p className="muted" style={{ fontSize: '.78rem', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <FiClock size={11} /> {p.delivery_days ? `${p.delivery_days}-day delivery` : 'Service'}
                  </p>
                ) : p.total_keys > 0 ? (
                  <p className="muted" style={{ fontSize: '.78rem', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <FiKey size={11} /> {p.unclaimed_keys} of {p.total_keys} keys left
                  </p>
                ) : p.quantity_limit !== null && (
                  <p className="muted" style={{ fontSize: '.78rem', marginTop: 4 }}>{p.quantity_sold}/{p.quantity_limit} sold</p>
                )}
              </div>
            </Link>

            {['serial', 'subscription'].includes(p.type) && (
              <Link to={`/dashboard/products/${p.id}/issues`} className="btn btn--ghost btn--sm"
                style={{ margin: '0 14px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <FiSend size={13} /> Publish issue
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
