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

// A "Buy now" / "Add to cart" button pointed at your own product is
// nonsensical (the backend blocks it too), so those get swapped for an
// "Edit listing" shortcut. Ownership is worked out from the logged-in
// creator vs this product's creator_id, wherever the card shows up ,
// Discover, search, a rail, not just passed down from the seller's own
// storefront view via the `isOwner` prop.
export default function ProductCard({ product, isOwner = false }) {
  const p = product;
  const navigate = useNavigate();
  const { user, creator } = useAuth();
  const { addToCart } = useCart();
  const owned = isOwner || (!!creator && creator.id === p.creator_id);
  const productUrl = `/@${p.creator_handle}/${p.slug}`;
  const soldOut = (p.quantity_limit !== null && p.quantity_sold >= p.quantity_limit)
    || (p.total_keys > 0 && p.unclaimed_keys <= 0);

  const [liked, setLiked] = useState(!!p.liked_by_me);
  const [likeCount, setLikeCount] = useState(p.like_count ?? 0);
  const [shareCount, setShareCount] = useState(p.share_count ?? 0);
  const [copied, setCopied] = useState(false);
  const [addedToCart, setAddedToCart] = useState(!!p.in_cart);
  const [cartError, setCartError] = useState(null);

  async function handleAddToCart(e) {
    e.stopPropagation();
    if (!user) { navigate(`/login?role=buyer&next=${encodeURIComponent(productUrl)}`); return; }
    if (addedToCart) return;
    try {
      await addToCart(p.slug);
      setAddedToCart(true);
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
    if (typeof data.share_count === 'number') setShareCount(data.share_count);
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
      onClick={() => navigate(productUrl)}
    >
      <div
        className={`product-card__cover${p.cover_path ? '' : ' product-card__cover--empty'}`}
        style={p.cover_path ? { backgroundImage: `url(${p.cover_path})` } : undefined}
      >
        {!p.cover_path && p.title.charAt(0).toUpperCase()}
        {p.promo_active && (
          <span className="product-card__category" style={{ left: 'auto', right: 10, background: 'var(--accent)', color: 'var(--chrome)' }}>
            {p.discount_percent}% off
          </span>
        )}
      </div>
      <div className="product-card__body">
        <p className="product-card__title"><Link to={productUrl} onClick={e => e.stopPropagation()}>{p.title}</Link></p>
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
          ) : p.price_minor === 0 ? (
            <span style={{ color: 'var(--brand-strong)' }}>Free</span>
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
          {owned ? (
            <Link
              to={`/dashboard/products/${p.id}/edit`}
              onClick={e => e.stopPropagation()}
              className="btn btn--cta btn--sm product-card__buy"
            >
              <FiEdit2 size={13} /> Edit listing
            </Link>
          ) : soldOut ? (
            <span className="badge badge--neutral">Sold out</span>
          ) : (
            <Link
              to={`${productUrl}/checkout`}
              onClick={e => e.stopPropagation()}
              className="btn btn--cta btn--sm product-card__buy"
            >
              {p.type === 'service' ? 'Order now' : p.price_minor === 0 ? 'Get for free' : 'Buy now'}
            </Link>
          )}
          {!owned && !soldOut && !p.pay_what_you_want && p.price_minor !== 0 && p.type !== 'service' && (
            <button
              onClick={handleAddToCart}
              className="btn btn--ghost btn--sm"
              title={addedToCart ? 'Already in cart' : 'Add to cart'}
              style={addedToCart ? { borderColor: 'var(--brand-strong)', color: 'var(--brand-strong)', cursor: 'default' } : undefined}
            >
              {addedToCart ? <FiCheck size={13} /> : <FiShoppingCart size={13} />}
            </button>
          )}
        </div>
        {cartError && <p className="error-text" style={{ fontSize: '.76rem', marginTop: 6 }}>{cartError}</p>}

        <div className="product-card__engagement">
          <button onClick={toggleLike} className={liked ? 'is-active' : ''}>
            <FiHeart fill={liked ? 'var(--red)' : 'none'} /> {likeCount}
          </button>
          <button onClick={e => { e.stopPropagation(); navigate(productUrl); }}>
            <FiMessageCircle /> {p.comment_count ?? 0}
          </button>
          <button onClick={share} style={copied ? { color: 'var(--brand-strong)' } : undefined}>
            {copied ? <FiCheck /> : <FiShare2 />} {copied ? 'Copied' : shareCount}
          </button>
        </div>
      </div>
    </div>
  );
}
