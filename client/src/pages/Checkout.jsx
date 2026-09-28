import { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import { FiUser, FiMail, FiPhone, FiSmartphone, FiArrowLeft, FiLogIn, FiShield } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api';
import { formatMoney } from '../lib/money';
import { CATEGORY_LABELS } from '../lib/categories.js';

export default function Checkout() {
  const { handle, slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState(null);
  const [checkout, setCheckout] = useState({ name: '', email: '', phone: '', amount: '' });
  const [status, setStatus] = useState('idle'); // idle | submitting | failed
  const [checkoutError, setCheckoutError] = useState(null);

  useEffect(() => {
    setProduct(null);
    setError(null);
    api.get(`/api/products/${slug}`)
      .then(setProduct)
      .catch(() => setError('This product could not be found.'));
  }, [slug]);

  // Pre-fill from the logged-in account once both it and the form's initial
  // (empty) state are known, without clobbering anything the buyer's typed.
  useEffect(() => {
    if (!user) return;
    setCheckout(c => ({
      ...c,
      name: c.name || user.name || '',
      email: c.email || user.email || ''
    }));
  }, [user]);

  async function handleBuy(e) {
    e.preventDefault();
    setStatus('submitting');
    try {
      // 30s, not the usual 15s default, see the identical note in
      // CartCheckout.jsx: this waits on Dischub actually triggering the
      // EcoCash prompt, which can genuinely take longer than a normal call.
      const data = await api.post('/api/purchases', { ...checkout, product_slug: slug }, 30000);
      if (data.free) {
        // Nothing was charged, so there's no order to poll status on ,
        // markPurchasePaid already ran synchronously server-side (see
        // purchases.js), the download is ready right now. Straight to the
        // library where it's waiting.
        navigate(`/account?got=${data.purchase_id}`);
        return;
      }
      // Non-redirecting flow: an EcoCash prompt was just pushed straight to
      // their phone, no external page to send them to. This is a client-
      // side route change to the same polling page PaymentReturn.jsx
      // already handles.
      navigate(`/payment/return?order_id=${data.order_id}`);
    } catch (err) {
      setCheckoutError(err.message);
      setStatus('failed');
    }
  }

  if (error) {
    return <div className="wrap center-page" style={{ padding: 20 }}><p className="error-text">{error}</p></div>;
  }
  if (!product || authLoading) {
    return (
      <div className="wrap" style={{ maxWidth: 460, padding: '56px 20px 80px' }}>
        <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius)', marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 200, borderRadius: 'var(--radius)' }} />
      </div>
    );
  }

  const soldOut = (product.quantity_limit !== null && product.quantity_sold >= product.quantity_limit)
    || (product.total_keys > 0 && product.unclaimed_keys <= 0);
  const alreadySubscribed = product.my_subscription?.status === 'active';
  const isFree = product.price_minor === 0 && !product.pay_what_you_want;
  const price = product.price_minor === 0 ? 'Free' : formatMoney(product.price_minor, product.currency);
  const discountedPrice = product.promo_active ? formatMoney(product.discounted_price_minor, product.currency) : null;
  const productUrl = `/@${handle}/${slug}`;

  // Buying without an account would mean this purchase can never be shown
  // to them again, no library, no re-download. An account is what makes
  // "your purchases are always here" actually true.
  if (!user) {
    return (
      <div className="wrap center-page" style={{ maxWidth: 420, padding: '20px' }}>
        <FiLogIn size={32} color="var(--muted)" style={{ marginBottom: 14 }} />
        <h1 style={{ fontSize: '1.4rem', marginBottom: 10 }}>Log in to buy this</h1>
        <p className="muted" style={{ marginBottom: 24 }}>
          An account is how you'll get back to what you buy: downloads, video, everything, saved to your library.
        </p>
        <Link to={`/login?role=buyer&next=${encodeURIComponent(location.pathname)}`} className="btn btn--gold">
          Log in or create an account
        </Link>
        <p style={{ marginTop: 16 }}>
          <Link to={productUrl} className="muted" style={{ fontSize: '.88rem', fontWeight: 600 }}>Back to product</Link>
        </p>
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

  return (
    <div className="wrap" style={{ maxWidth: 460, padding: '32px 20px 80px' }}>
      <Link to={productUrl} className="btn btn--ghost btn--sm" style={{ marginBottom: 20 }}>
        <FiArrowLeft size={14} /> Back to product
      </Link>

      <div className="card card--pad">
        <div className="order-summary">
          <div
            className="order-summary__cover"
            style={product.cover_path ? { backgroundImage: `url(${product.cover_path})` } : undefined}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {product.category && CATEGORY_LABELS[product.category] && (
                <span className="badge badge--category">{CATEGORY_LABELS[product.category]}</span>
              )}
              {product.promo_active && <span className="badge badge--gold">{product.discount_percent}% off</span>}
            </div>
            <p style={{ fontWeight: 700, fontSize: '1.1rem', lineHeight: 1.25 }}>{product.title}</p>
            <p className="mono" style={{ fontWeight: 700, marginTop: 4 }}>
              {product.promo_active ? (
                <>
                  <span style={{ color: 'var(--muted)', textDecoration: 'line-through', fontWeight: 500, marginRight: 8 }}>{price}</span>
                  <span style={{ color: 'var(--green-glow)' }}>{discountedPrice}</span>
                </>
              ) : (
                <span style={{ color: 'var(--green-glow)' }}>{product.pay_what_you_want && !isFree ? `From ${price}` : price}</span>
              )}
              {product.type === 'serial' && (
                <span className="muted" style={{ fontSize: '.78rem', fontWeight: 500 }}> once, unlocks every issue</span>
              )}
              {product.type === 'subscription' && (
                <span className="muted" style={{ fontSize: '.78rem', fontWeight: 500 }}> /month</span>
              )}
            </p>
          </div>
        </div>

        {soldOut && <p className="error-text">Sold out.</p>}

        {!soldOut && alreadySubscribed && (
          <div className="trust-line">
            <FiShield size={16} />
            <span>
              You're already subscribed, renews on {new Date(product.my_subscription.current_period_end.replace(' ', 'T') + 'Z').toLocaleDateString()}.{' '}
              <Link to="/account" style={{ fontWeight: 600 }}>Manage it from your account</Link>.
            </span>
          </div>
        )}

        {!soldOut && !alreadySubscribed && (
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
            {!isFree && (
              <div className="field input-icon">
                <label htmlFor="buyer_phone">EcoCash number</label>
                <FiPhone size={15} />
                <input id="buyer_phone" required value={checkout.phone} placeholder="0780070488"
                  onChange={e => setCheckout(c => ({ ...c, phone: e.target.value }))} />
              </div>
            )}
            {!!product.pay_what_you_want && (
              <div className="field">
                <label htmlFor="buyer_amount">Amount ({product.currency})</label>
                <input id="buyer_amount" type="number" min={(product.min_price_minor || 0) / 100} step="0.01" required
                  value={checkout.amount} onChange={e => setCheckout(c => ({ ...c, amount: e.target.value }))} />
                <small>Enter 0 for free, if the creator's minimum allows it.</small>
              </div>
            )}

            {!isFree && (
              <div className="pay-methods">
                <span className="pay-method"><FiSmartphone size={13} /> EcoCash</span>
              </div>
            )}

            {product.type === 'service' && (
              <div className="trust-line">
                <FiShield size={16} />
                <span>Payment is held safely until the seller delivers. You'll get a chance to confirm or report a problem before it's released to them.</span>
              </div>
            )}
            {product.type === 'subscription' && (
              <div className="trust-line">
                <FiShield size={16} />
                <span>This renews monthly. EcoCash can't auto-charge you, so we'll remind you a few days before each renewal, and you approve it yourself from your account.</span>
              </div>
            )}

            {status === 'failed' && <p className="error-text">{checkoutError || "Payment didn't go through. Try again."}</p>}
            <button className="btn btn--gold btn--block" disabled={status === 'submitting'} type="submit">
              {status === 'submitting' ? (isFree ? 'Getting it...' : 'Sending EcoCash prompt...')
                : isFree ? 'Get it now, free'
                : product.type === 'service' ? `Order for ${price}`
                : product.type === 'subscription' ? `Subscribe for ${price}/month`
                : `Buy for ${product.promo_active ? discountedPrice : price}`}
            </button>
            {isFree && (
              <p className="muted" style={{ fontSize: '.76rem', textAlign: 'center', marginTop: 10 }}>
                No payment needed, it's yours the moment you click.
              </p>
            )}
            {!isFree && (
              <p className="muted" style={{ fontSize: '.76rem', textAlign: 'center', marginTop: 10 }}>
                You'll get an EcoCash prompt on your phone to approve this payment. No need to leave this page.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
