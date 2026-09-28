import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FiUser, FiMail, FiPhone, FiSmartphone, FiArrowLeft, FiLogIn, FiZap, FiLock, FiShield } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api';
import { formatMoney } from '../lib/money';

export default function CartCheckout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [checkout, setCheckout] = useState({ name: '', email: '', phone: '' });
  const [status, setStatus] = useState('idle'); // idle | submitting | failed
  const [checkoutError, setCheckoutError] = useState(null);

  useEffect(() => {
    if (!user) return;
    api.get('/api/cart').then(setItems).catch(err => setError(err.message));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setCheckout(c => ({ ...c, name: c.name || user.name || '', email: c.email || user.email || '' }));
  }, [user]);

  async function handleBuy(e) {
    e.preventDefault();
    setStatus('submitting');
    try {
      // 30s, not the usual 15s default, this waits on Dischub actually
      // triggering the EcoCash prompt, which can genuinely take longer
      // than a normal API call. Not retried on failure either way (POST),
      // so this only changes how long a still-working request gets before
      // being wrongly reported as failed.
      const data = await api.post('/api/cart/checkout', checkout, 30000);
      navigate(`/payment/return?order_id=${data.order_id}`);
    } catch (err) {
      setCheckoutError(err.message);
      setStatus('failed');
    }
  }

  if (authLoading) return null;

  if (!user) {
    return (
      <div className="wrap center-page" style={{ maxWidth: 420, padding: '20px' }}>
        <FiLogIn size={32} color="var(--muted)" style={{ marginBottom: 14 }} />
        <h1 style={{ fontSize: '1.4rem', marginBottom: 10 }}>Log in to check out</h1>
        <Link to={`/login?role=buyer&next=${encodeURIComponent(location.pathname)}`} className="btn btn--gold">
          Log in or create an account
        </Link>
      </div>
    );
  }

  if (!user.email_verified_at) {
    return (
      <div className="wrap center-page" style={{ maxWidth: 440, padding: '20px' }}>
        <FiShield size={32} color="var(--gold)" style={{ marginBottom: 14 }} />
        <h1 style={{ fontSize: '1.4rem', marginBottom: 10 }}>Verify your email before paying</h1>
        <p className="muted" style={{ marginBottom: 24 }}>Verification protects your account and keeps your purchases linked to you for future downloads.</p>
        <Link to={`/check-email?next=${encodeURIComponent(location.pathname)}`} className="btn btn--gold">Verify email</Link>
      </div>
    );
  }

  if (error) {
    return <div className="wrap center-page" style={{ padding: 20 }}><p className="error-text">{error}</p></div>;
  }

  if (!items) {
    return (
      <div className="wrap" style={{ maxWidth: 460, padding: '56px 20px 80px' }}>
        <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius)', marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 200, borderRadius: 'var(--radius)' }} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="wrap center-page" style={{ maxWidth: 420, padding: '20px' }}>
        <h1 style={{ fontSize: '1.4rem', marginBottom: 10 }}>Your cart is empty</h1>
        <Link to="/discover" className="btn btn--primary">Browse the marketplace</Link>
      </div>
    );
  }

  const currencies = new Set(items.map(p => p.currency));
  const total = items.reduce((sum, p) => sum + (p.promo_active ? p.discounted_price_minor : p.price_minor), 0);
  const totalPrice = formatMoney(total, items[0].currency);

  return (
    <div className="wrap" style={{ maxWidth: 460, padding: '32px 20px 80px' }}>
      <Link to="/cart" className="btn btn--ghost btn--sm" style={{ marginBottom: 20 }}>
        <FiArrowLeft size={14} /> Back to cart
      </Link>

      <div className="card card--pad">
        <p style={{ fontWeight: 700, marginBottom: 12 }}>{items.length} item{items.length === 1 ? '' : 's'}</p>
        <div style={{ display: 'grid', gap: 8, marginBottom: 18, paddingBottom: 18, borderBottom: '1px solid var(--line)' }}>
          {items.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.88rem' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 10 }}>{p.title}</span>
              <span className="mono muted" style={{ flexShrink: 0 }}>
                {formatMoney(p.promo_active ? p.discounted_price_minor : p.price_minor, p.currency)}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ fontWeight: 700 }}>Total</span>
          <span className="mono" style={{ fontWeight: 700, color: 'var(--green-glow)' }}>{totalPrice}</span>
        </div>

        {currencies.size > 1 ? (
          <p className="error-text">
            Your cart has items in different currencies. Go back and remove the others before checking out.
          </p>
        ) : (
          <form onSubmit={handleBuy}>
            <div className="field input-icon">
              <label htmlFor="buyer_name">Name</label>
              <FiUser size={15} />
              <input id="buyer_name" value={checkout.name} onChange={e => setCheckout(c => ({ ...c, name: e.target.value }))} />
            </div>
            <div className="field input-icon">
              <label htmlFor="buyer_email">Email</label>
              <FiMail size={15} />
              <input id="buyer_email" type="email" required value={checkout.email}
                onChange={e => setCheckout(c => ({ ...c, email: e.target.value }))} />
            </div>
            <div className="field input-icon">
              <label htmlFor="buyer_phone">EcoCash number</label>
              <FiPhone size={15} />
              <input id="buyer_phone" required value={checkout.phone} placeholder="0780070488"
                onChange={e => setCheckout(c => ({ ...c, phone: e.target.value }))} />
            </div>

            <div className="pay-methods">
              <span className="pay-method"><FiSmartphone size={13} /> EcoCash</span>
            </div>

            <ul className="buy-benefits">
              <li><FiZap size={14} /> Instant access to everything, the moment payment clears</li>
              <li><FiShield size={14} /> 5-day buyer protection on every item</li>
              <li><FiLock size={14} /> Secure payment via EcoCash</li>
            </ul>

            {status === 'failed' && <p className="error-text">{checkoutError || "Payment didn't go through. Try again."}</p>}
            <button className="btn btn--gold btn--block" disabled={status === 'submitting'} type="submit">
              {status === 'submitting' ? 'Sending EcoCash prompt...' : `Pay ${totalPrice}`}
            </button>
            <p className="muted" style={{ fontSize: '.76rem', textAlign: 'center', marginTop: 10 }}>
              You'll get an EcoCash prompt on your phone to approve this payment. No need to leave this page.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
