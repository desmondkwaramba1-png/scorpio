import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiHeart, FiMessageCircle, FiShare2, FiCheck, FiEye, FiShoppingCart, FiEdit2 } from 'react-icons/fi';
import Seal from './Seal.jsx';
import { Stars } from './ReviewsSection.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { api } from '../lib/api';
import { formatMoney } from '../lib/money';
import { CATEGORY_LABELS } from '../lib/categories.js';
import { shareOrCopy } from '../lib/share';

// isOwner: true when the logged-in creator viewing this card IS the seller
// (their own storefront, seen through CreatorProfile.jsx) — a "Buy now"
// button pointed at yourself is nonsensical, so this swaps the buy row for
// an edit shortcut instead of pretending the seller is a customer here.
export default function ProductCard({ product, isOwner = false }) {
  const p = product;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToCart } = useCart();
  const productUrl = `/@${p.creator_handle}/${p.slug}`;
  const soldOut = (p.quantity_limit !== null && p.quantity_sold >= p.quantity_limit)
    || (p.total_keys > 0 && p.unclaimed_keys <= 0);

  const [liked, setLiked] = useState(!!p.liked_by_me);
  const [likeCount, setLikeCount] = useState(p.like_count ?? 0);
  const [shareCount, setShareCount] = useState(p.share_count ?? 0);
  const [copied, setCopied] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [cartError, setCartError] = useState(null);

  async function handleAddToCart(e) {
    e.stopPropagation();
    if (!user) { navigate(`/login?role=buyer&next=${encodeURIComponent(productUrl)}`); return; }
    try {
      await addToCart(p.slug);
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 1800);
    } catch (err) {
      setCartError(err.message);
      setTimeout(() => setCartError(null), 2600);
    }
  }

  async function toggleLike(e) {
    e.stopPropagation();
    if (!user) { navigate(`/login?role=buyer&next=${encodeURIComponent(productUrl)}`); return; }
    const data = await api.post(`/api/products/${p.id}/like`);
    setLiked(data.liked);
    setLikeCount(data.like_count);
  }

  async function share(e) {
    e.stopPropagation();
    const url = `${window.location.origin}${productUrl}`;
    const method = await shareOrCopy({ title: p.title, text: `Check out ${p.title} on SCORPIO`, url });
    if (!method) return; // user cancelled the native share sheet
    const data = await api.post(`/api/products/${p.id}/share`, { channel: method });
    setShareCount(data.share_count);
    if (method === 'copy_link') {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  // Not a <Link> at the top level: several bits inside (creator name, like,
  // comment, share) need to be their own clickable targets, and an <a> can't
  // contain another <a> or reliably nest interactive elements. This div does
  // the same "click anywhere to open the product" job with a handler instead.
  return (
    <div
      className="product-card"
      role="link"
      tabIndex={0}
      onClick={() => navigate(productUrl)}
      onKeyDown={e => { if (e.key === 'Enter') navigate(productUrl); }}
    >
      <div
        className={`product-card__cover${p.cover_path ? '' : ' product-card__cover--empty'}`}
        style={p.cover_path ? { backgroundImage: `url(${p.cover_path})` } : undefined}
      >
        {!p.cover_path && p.title.charAt(0).toUpperCase()}
        {p.creator_avatar && (
          <div className="product-card__watermark" style={{ backgroundImage: `url(${p.creator_avatar})` }} />
        )}
        {p.category && CATEGORY_LABELS[p.category] && (
          <span className="product-card__category">{CATEGORY_LABELS[p.category]}</span>
        )}
        {p.promo_active && (
          <span className="product-card__category" style={{ left: 'auto', right: 10, background: 'var(--gold)', color: 'var(--green-dark)' }}>
            {p.discount_percent}% off
          </span>
        )}
      </div>
      <div className="product-card__body">
        <p className="product-card__title">{p.title}</p>
        <div className="product-card__meta">
          <Link to={`/@${p.creator_handle}`} className="product-card__creator" onClick={e => e.stopPropagation()}>
            {p.creator_name}
          </Link>
          {!!p.creator_verified && <Seal />}
        </div>
        <p className="mono product-card__price">
          {p.promo_active ? (
            <>
              <span style={{ color: 'var(--muted)', textDecoration: 'line-through', fontWeight: 500, fontSize: '.85rem', marginRight: 6 }}>
                {formatMoney(p.price_minor, p.currency)}
              </span>
              {formatMoney(p.discounted_price_minor, p.currency)}
            </>
          ) : (
            p.pay_what_you_want ? `From ${formatMoney(p.price_minor, p.currency)}` : formatMoney(p.price_minor, p.currency)
          )}
        </p>
        {p.review_count > 0 && (
          <p className="product-card__sold" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Stars value={p.avg_rating} size={11} /> {p.avg_rating} ({p.review_count})
          </p>
        )}
        {p.quantity_sold > 0 && (
          <p className="product-card__sold">{p.quantity_sold} sold</p>
        )}
        {p.total_keys > 0 && !soldOut && (
          <p className="product-card__sold">{p.unclaimed_keys} key{p.unclaimed_keys === 1 ? '' : 's'} left</p>
        )}

        <div className="product-card__buyrow">
          {isOwner ? (
            <Link
              to={`/dashboard/products/${p.id}/edit`}
              onClick={e => e.stopPropagation()}
              className="btn btn--gold btn--sm product-card__buy"
            >
              <FiEdit2 size={13} /> Edit listing
            </Link>
          ) : soldOut ? (
            <span className="badge badge--neutral">Sold out</span>
          ) : (
            <Link
              to={`${productUrl}/checkout`}
              onClick={e => e.stopPropagation()}
              className="btn btn--gold btn--sm product-card__buy"
            >
              {p.type === 'service' ? 'Order now' : 'Buy now'}
            </Link>
          )}
          {!isOwner && !soldOut && !p.pay_what_you_want && p.type !== 'service' && (
            <button
              onClick={handleAddToCart}
              className="btn btn--ghost btn--sm"
              title="Add to cart"
              style={addedToCart ? { borderColor: 'var(--green-glow)', color: 'var(--green-glow)' } : undefined}
            >
              {addedToCart ? <FiCheck size={13} /> : <FiShoppingCart size={13} />}
            </button>
          )}
          <Link to={productUrl} onClick={e => e.stopPropagation()} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            color: 'var(--muted)', fontSize: '.78rem', fontWeight: 600
          }}>
            <FiEye size={12} /> View
          </Link>
        </div>
        {cartError && <p className="error-text" style={{ fontSize: '.76rem', marginTop: 6 }}>{cartError}</p>}

        <div className="product-card__engagement">
          <button onClick={toggleLike} className={liked ? 'is-active' : ''}>
            <FiHeart fill={liked ? 'var(--red)' : 'none'} /> {likeCount}
          </button>
          <button onClick={e => { e.stopPropagation(); navigate(productUrl); }}>
            <FiMessageCircle /> {p.comment_count ?? 0}
          </button>
          <button onClick={share} style={copied ? { color: 'var(--green-glow)' } : undefined}>
            {copied ? <FiCheck /> : <FiShare2 />} {copied ? 'Copied' : shareCount}
          </button>
        </div>
      </div>
    </div>
  );
}
