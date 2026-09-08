import { useEffect, useState } from 'react';
import { FiFlag, FiCheck } from 'react-icons/fi';
import { useAdmin } from '../context/AdminContext.jsx';
import { SITE_ORIGIN } from '../lib/site';

export default function Flagged() {
  const { adminFetch, adminPost } = useAdmin();
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);
  const [clearing, setClearing] = useState(null);

  useEffect(() => {
    adminFetch('/api/admin/flagged-products').then(setProducts).catch(err => setError(err.message));
  }, [adminFetch]);

  async function clearFlag(id) {
    setClearing(id);
    try {
      await adminPost(`/api/admin/products/${id}/clear-flag`);
      setProducts(list => list.filter(p => p.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setClearing(null);
    }
  }

  if (error) return <p className="error-text">{error}</p>;
  if (!products) return <p className="muted">Loading...</p>;

  return (
    <div>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: 16 }}>
        Automated content-verification findings only — a duplicate file hash, a type/extension mismatch, or a page
        count that contradicts the listing itself. Never an AI opinion or a judgment call.
      </p>
      {products.length === 0 ? (
        <div className="empty-state"><FiFlag size={22} color="var(--muted)" style={{ marginBottom: 8 }} /><strong>Nothing flagged.</strong></div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {products.map(p => (
            <div key={p.id} className="card card--pad" style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <a href={`${SITE_ORIGIN}/@${p.creator_handle}/${p.slug}`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>{p.title}</a>
                <p className="muted" style={{ fontSize: '.85rem' }}>{p.creator_name} &middot; {p.category}</p>
                <p style={{ fontSize: '.85rem', color: 'var(--red)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FiFlag size={13} /> {p.flag_reason}
                </p>
                {p.file_hash && (
                  <p className="mono muted" style={{ fontSize: '.76rem', marginTop: 4 }}>
                    {p.original_filename} &middot; {p.detected_mime}{p.page_count ? ` · ${p.page_count} pages` : ''}
                  </p>
                )}
              </div>
              <button className="btn btn--ghost btn--sm" onClick={() => clearFlag(p.id)} disabled={clearing === p.id} style={{ flexShrink: 0 }}>
                <FiCheck size={14} /> {clearing === p.id ? 'Clearing...' : 'Looks fine, clear it'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
