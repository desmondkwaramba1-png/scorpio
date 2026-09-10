import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiTrash2, FiShoppingCart, FiCompass, FiShield, FiLock } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { api } from '../lib/api';
import { formatMoney } from '../lib/money';

export default function Cart() {
  const { user, loading: authLoading } = useAuth();
  const { removeFromCart } = useCart();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    api.get('/api/cart').then(setItems).catch(err => setError(err.message));
  }, [user]);

  async function remove(productId) {
    setItems(list => list.filter(p => p.id !== productId));
    try {
      await removeFromCart(productId);
    } catch {
      // best-effort — a stale row reappearing on next load is a smaller
      // problem than blocking removal on a flaky network request
    }
  }

  if (authLoading) return null;

  if (!user) {
    return (
      <div className="wrap" style={{ maxWidth: 420, padding: '56px 20px 80px', textAlign: 'center' }}>
        <FiShoppingCart size={32} color="var(--muted)" style={{ marginBottom: 14 }} />
        <h1 style={{ fontSize: '1.4rem', marginBottom: 10 }}>Log in to see your cart</h1>
        <Link to="/login?role=buyer&next=/cart" className="btn btn--gold">Log in or create an account</Link>
      </div>
    );
  }

  if (error) {
    return <div className="wrap" style={{ padding: '80px 20px', textAlign: 'center' }}><p className="error-text">{error}</p></div>;
  }

  if (!items) {
    return (
      <div className="wrap" style={{ maxWidth: 640, padding: '40px 20px 80px' }}>
        <h1 style={{ fontSize: '1.6rem', marginBottom: 24 }}>Your cart</h1>
        <div style={{ display: 'grid', gap: 12 }}>
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 'var(--radius)' }} />)}
        </div>
      </div>
    );
  }

  const currencies = new Set(items.map(p => p.currency));
  const total = items.reduce((sum, p) => sum + (p.promo_active ? p.discounted_price_minor : p.price_minor), 0);

  return (
    <div className="wrap" style={{ maxWidth: 680, padding: '40px 20px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <FiShoppingCart size={22} color="var(--green)" />
        <h1 style={{ fontSize: '1.6rem' }}>Your cart</h1>
      </div>
      <p className="muted" style={{ marginBottom: 28 }}>
        {items.length} item{items.length === 1 ? '' : 's'} ready to check out
      </p>

      {items.length === 0 ? (
        <div className="empty-state">
          <FiCompass size={26} color="var(--muted)" style={{ marginBottom: 10 }} />
          <strong>Your cart is empty.</strong>
          <p className="muted" style={{ fontSize: '.88rem', marginTop: 4, marginBottom: 16 }}>
            Find something worth having and it'll show up here.
          </p>
          <Link to="/discover" className="btn btn--gold btn--sm">
            <FiCompass size={14} /> Browse the marketplace
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 32 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            {items.map(p => {
              const price = formatMoney(p.price_minor, p.currency);
              const discounted = p.promo_active ? formatMoney(p.discounted_price_minor, p.currency) : null;
              return (
                <div key={p.id} className="card card--pad cart-item">
                  <div
                    className={`cart-item__cover${p.cover_path ? '' : ' cart-item__cover--empty'}`}
                    style={p.cover_path ? { backgroundImage: `url(${p.cover_path})` } : undefined}
                  >
                    {!p.cover_path && p.title.charAt(0).toUpperCase()}
                  </div>
                  <div className="cart-item__info" style={{ minWidth: 0 }}>
                    <Link to={`/@${p.creator_handle}/${p.slug}`} style={{ fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.title}
                    </Link>
                    <p className="muted" style={{ fontSize: '.85rem' }}>{p.creator_name}</p>
                  </div>
                  <p className="mono cart-item__price" style={{ fontWeight: 700 }}>
                    {p.promo_active ? (
                      <>
                        <span style={{ color: 'var(--muted)', textDecoration: 'line-through', fontWeight: 500, fontSize: '.85rem', marginRight: 6 }}>{price}</span>
                        <span style={{ color: 'var(--green-glow)' }}>{discounted}</span>
                      </>
                    ) : (
                      <span style={{ color: 'var(--green-glow)' }}>{price}</span>
                    )}
                  </p>
                  <button onClick={() => remove(p.id)} className="btn btn--ghost btn--sm cart-item__remove" title="Remove from cart" aria-label="Remove from cart">
                    <FiTrash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          {currencies.size > 1 && (
            <p className="error-text" style={{ marginTop: -20 }}>
              Your cart has items priced in different currencies. You'll need to check out one currency at a time, so remove the others for now.
            </p>
          )}

          <div className="card card--pad cart-summary">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span className="muted" style={{ fontSize: '.9rem' }}>Total ({items.length} item{items.length === 1 ? '' : 's'})</span>
              <span className="mono" style={{ fontWeight: 700, fontSize: '1.35rem' }}>{formatMoney(total, items[0].currency)}</span>
            </div>
            <button
              onClick={() => navigate('/checkout')}
              className="btn btn--gold btn--block"
              disabled={currencies.size > 1}
            >
              <FiLock size={15} /> Checkout &mdash; {formatMoney(total, items[0].currency)}
            </button>
            <div className="trust-line" style={{ marginTop: 16, marginBottom: 0 }}>
              <FiShield size={16} />
              <span>Every order carries 5-day buyer protection. Not what you expected? Report it for a refund.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
