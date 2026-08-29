import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiTrash2, FiShoppingCart, FiCompass } from 'react-icons/fi';
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
    <div className="wrap" style={{ maxWidth: 640, padding: '40px 20px 80px' }}>
      <h1 style={{ fontSize: '1.6rem', marginBottom: 4 }}>Your cart</h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        {items.length} item{items.length === 1 ? '' : 's'}
      </p>

      {items.length === 0 ? (
        <div className="empty-state">
          <FiCompass size={26} color="var(--muted)" style={{ marginBottom: 10 }} />
          <strong>Your cart is empty.</strong>
          <Link to="/discover" style={{ color: 'var(--green)', fontWeight: 600 }}>Browse the marketplace</Link>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 12, marginBottom: 24 }}>
            {items.map(p => {
              const price = formatMoney(p.price_minor, p.currency);
              const discounted = p.promo_active ? formatMoney(p.discounted_price_minor, p.currency) : null;
              return (
                <div key={p.id} className="card card--pad cart-item">
                  <div
                    className="order-summary__cover"
                    style={p.cover_path ? { backgroundImage: `url(${p.cover_path})` } : undefined}
                  />
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
                  <button onClick={() => remove(p.id)} className="btn btn--ghost btn--sm cart-item__remove" title="Remove from cart">
                    <FiTrash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          {currencies.size > 1 && (
            <p className="error-text" style={{ marginBottom: 16 }}>
              Your cart has items priced in different currencies. You'll need to check out one currency at a time, so remove the others for now.
            </p>
          )}

          <div className="card card--pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <p className="muted" style={{ fontSize: '.82rem' }}>Total</p>
              <p className="mono" style={{ fontWeight: 700, fontSize: '1.2rem' }}>{formatMoney(total, items[0].currency)}</p>
            </div>
            <button
              onClick={() => navigate('/checkout')}
              className="btn btn--gold"
              disabled={currencies.size > 1}
            >
              Proceed to checkout
            </button>
          </div>
        </>
      )}
    </div>
  );
}
