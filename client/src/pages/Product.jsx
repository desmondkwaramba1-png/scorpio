import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FiShield, FiCompass, FiShare2, FiCheck, FiEdit2, FiShoppingCart, FiLock, FiZap, FiFileText, FiPlay } from 'react-icons/fi';
import Seal from '../components/Seal.jsx';
import EngagementBar from '../components/EngagementBar.jsx';
import CommentsSection from '../components/CommentsSection.jsx';
import ReviewsSection, { Stars } from '../components/ReviewsSection.jsx';
import CompactProductCard from '../components/CompactProductCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { formatMoney } from '../lib/money';
import { CATEGORY_LABELS } from '../lib/categories.js';
import { shareOrCopy } from '../lib/share';
import { useSEO } from '../lib/seo';
import { SITE_ORIGIN } from '../lib/site';

// A short extension read off the actual uploaded file, not a guess — real
// specificity ("Delivered as PDF") reads as more trustworthy on a page
// full of otherwise-generic product listings than a vague "digital file"
// ever would. null for an external-link deliverable, which has no
// filename to read a format from.
function fileFormatLabel(files) {
  const upload = files?.find(f => f.kind === 'upload' && f.original_filename);
  if (!upload) return null;
  const ext = upload.original_filename.split('.').pop();
  return ext && ext.length <= 5 ? ext.toUpperCase() : null;
}

// A view page, not a checkout form — clicking a product to see what it is
// shouldn't force a payment form in front of you. Buying is an explicit
// next step (its own page, its own URL) for people who've decided they want it.
export default function Product() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user, creator, loading: authLoading } = useAuth();
  const { addToCart } = useCart();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [cartError, setCartError] = useState(null);
  const [moreFromCreator, setMoreFromCreator] = useState(null);
  const [productReel, setProductReel] = useState(null);
  const commentsRef = useRef(null);

  useEffect(() => {
    setProduct(null);
    setError(null);
    setMoreFromCreator(null);
    setProductReel(null);
    fetch(`/api/reels?product=${slug}&limit=1`).then(r => r.json()).then(reels => setProductReel(reels[0] || null)).catch(() => {});
    fetch(`/api/products/${slug}`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(product => {
        setProduct(product);
        // /api/creators/:handle doesn't repeat creator_handle on each
        // product row (every item in that list is obviously the same
        // creator) — CompactProductCard needs it to build a link, so it's
        // stitched back on here from the outer product we already have.
        fetch(`/api/creators/${product.creator_handle}`)
          .then(r => r.json())
          .then(({ products }) => setMoreFromCreator(
            (products || [])
              .filter(p => p.id !== product.id)
              .slice(0, 8)
              .map(p => ({ ...p, creator_handle: product.creator_handle }))
          ))
          .catch(() => setMoreFromCreator([]));
      })
      .catch(() => setError('This product could not be found. The link may be wrong or it may have been removed.'));
  }, [slug]);

  // Called unconditionally, before the early returns below — a hook can
  // never sit after a return that only fires on some renders (the loading
  // skeleton fires on the very first render, before `product` exists, then
  // never again once it loads), or React throws "rendered more hooks than
  // during the previous render" (error #310) the moment the count changes.
  const productUrlForSeo = product ? `/@${product.creator_handle}/${product.slug}` : null;
  useSEO({
    title: product ? `${product.title} by ${product.creator_name} — SCORPIO` : undefined,
    description: product
      ? (product.description
        ? product.description.slice(0, 160)
        : `${product.title} — ${formatMoney(product.price_minor, product.currency)} on SCORPIO. Real work from ${product.creator_name}, not scraped off the internet.`)
      : undefined,
    image: product?.cover_path,
    url: productUrlForSeo ? `${SITE_ORIGIN}${productUrlForSeo}` : undefined
  });

  if (error) {
    return <div className="wrap" style={{ padding: '80px 20px', textAlign: 'center' }}><p className="error-text">{error}</p></div>;
  }
  if (!product || authLoading) {
    return (
      <div className="product-layout wrap">
        <div>
          <div className="skeleton" style={{ aspectRatio: '16/9', maxHeight: 280, borderRadius: 'var(--radius)' }} />
          <div className="skeleton" style={{ height: 24, width: '60%', marginTop: 22, marginBottom: 14 }} />
          <div className="skeleton" style={{ height: 14, width: '100%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 14, width: '90%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 14, width: '75%' }} />
        </div>
        <div className="card card--pad">
          <div className="skeleton" style={{ height: 16, width: '80%', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 20, width: '40%', marginBottom: 18 }} />
          <div className="skeleton" style={{ height: 44, width: '100%' }} />
        </div>
      </div>
    );
  }

  const soldOut = (product.quantity_limit !== null && product.quantity_sold >= product.quantity_limit)
    || (product.total_keys > 0 && product.unclaimed_keys <= 0);
  const price = formatMoney(product.price_minor, product.currency);
  const discountedPrice = product.promo_active ? formatMoney(product.discounted_price_minor, product.currency) : null;
  const productUrl = `/@${product.creator_handle}/${product.slug}`;
  const checkoutUrl = `${productUrl}/checkout`;
  const isOwner = creator?.id === product.creator_id;
  const fileFormat = fileFormatLabel(product.files);

  async function handleAddToCart() {
    if (!user) { navigate(`/login?role=buyer&next=${encodeURIComponent(productUrl)}`); return; }
    try {
      await addToCart(product.slug);
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 1800);
    } catch (err) {
      setCartError(err.message);
    }
  }

  async function shareProduct() {
    const method = await shareOrCopy({ title: product.title, text: `Check out ${product.title} on SCORPIO`, url: window.location.href });
    if (method === 'copy_link') {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <div className="product-layout wrap">
      <div>
        <div
          className="product-cover"
          style={product.cover_path ? { backgroundImage: `url(${product.cover_path})` } : undefined}
        >
          {product.creator_avatar && (
            <div className="product-cover__watermark" style={{ backgroundImage: `url(${product.creator_avatar})` }} />
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 22 }}>
          {product.category && CATEGORY_LABELS[product.category] && (
            <span className="badge badge--category" style={{ marginBottom: 0 }}>{CATEGORY_LABELS[product.category]}</span>
          )}
          {product.promo_active && (
            <span className="badge badge--gold">{product.discount_percent}% off</span>
          )}
        </div>
        <h1 style={{ fontSize: '1.6rem', lineHeight: 1.25, marginTop: 10 }}>{product.title}</h1>

        {product.review_count > 0 && (
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <Stars value={product.avg_rating} size={13} />
            <span className="muted" style={{ fontSize: '.85rem' }}>
              {product.avg_rating} ({product.review_count} review{product.review_count === 1 ? '' : 's'})
            </span>
          </p>
        )}

        {(product.quantity_sold > 0 || (product.quantity_limit !== null && !soldOut) || (product.total_keys > 0 && !soldOut)) && (
          <p className="product-card__sold" style={{ marginTop: 6, fontSize: '.85rem' }}>
            {product.quantity_sold > 0 && `${product.quantity_sold} people have bought this`}
            {product.quantity_sold > 0 && (product.quantity_limit !== null || product.total_keys > 0) && ' · '}
            {product.quantity_limit !== null && !soldOut && `${product.quantity_limit - product.quantity_sold} left`}
            {product.total_keys > 0 && !soldOut && `${product.unclaimed_keys} key${product.unclaimed_keys === 1 ? '' : 's'} left`}
          </p>
        )}

        {product.description && (
          <p style={{ marginTop: 20, fontSize: '1rem', lineHeight: 1.7, maxWidth: '68ch' }}>{product.description}</p>
        )}

        {/* At most one video here, never both — a product with both a
            course preview clip AND a separately-tagged reel used to stack
            two players back to back with near-identical "watch this"
            labels, which is exactly the "products, previews, reels all
            mixed together" clutter on what should be a single buy
            decision. The purpose-built course preview wins when both
            exist; the reel is the fallback when there's no formal preview. */}
        {product.preview_video_path ? (
          <div className="product-reel">
            <p className="product-reel__label"><FiPlay size={13} /> Free preview, watch before you buy</p>
            <video src={product.preview_video_path} controls playsInline className="product-reel__video" />
            <p className="muted" style={{ fontSize: '.82rem', marginTop: 8 }}>
              A real sample from the course, not the full paid content. No account or payment needed to watch it.
            </p>
          </div>
        ) : productReel && (
          <div className="product-reel">
            <p className="product-reel__label"><FiPlay size={13} /> See it from {product.creator_name}</p>
            <video src={productReel.video_path} controls playsInline className="product-reel__video" />
            {productReel.caption && <p className="muted" style={{ fontSize: '.88rem', marginTop: 8 }}>{productReel.caption}</p>}
          </div>
        )}

        {product.type === 'service' && (product.portfolio_url || product.delivery_days) && (
          <div style={{ marginTop: 14 }}>
            {product.delivery_days && (
              <p className="muted" style={{ fontSize: '.9rem', marginBottom: product.portfolio_url ? 8 : 0 }}>
                Typically delivers in {product.delivery_days} day{product.delivery_days === 1 ? '' : 's'}
              </p>
            )}
            {product.portfolio_url && (
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {product.portfolio_url.split('\n').map(u => u.trim()).filter(Boolean).map((url, i) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.9rem', fontWeight: 600, color: 'var(--green-glow)' }}>
                    Portfolio {product.portfolio_url.includes('\n') ? i + 1 : ''} →
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {product.type === 'service' && product.service_terms && (
          <div className="card card--pad" style={{ marginTop: 20 }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>What's included &amp; terms</p>
            <p className="muted" style={{ fontSize: '.9rem', lineHeight: 1.65, whiteSpace: 'pre-line', overflowWrap: 'break-word' }}>{product.service_terms}</p>
          </div>
        )}

        <Link to={`/@${product.creator_handle}`} style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
            background: product.creator_avatar ? `url(${product.creator_avatar}) center/cover` : 'var(--green-dark)'
          }} />
          <span style={{ fontWeight: 600, fontSize: '.95rem' }}>{product.creator_name}</span>
          {!!product.creator_verified && <Seal />}
        </Link>

        {product.creator_bio && <p className="muted" style={{ marginTop: 10, fontSize: '.92rem', lineHeight: 1.6 }}>{product.creator_bio}</p>}

        {product.status === 'draft' && (
          <span className="badge badge--gold" style={{ marginTop: 18, display: 'inline-flex' }}>DRAFT (only visible to you)</span>
        )}

        {product.type === 'serial' && product.issues?.length > 0 && (
          <div className="card card--pad" style={{ marginTop: 28 }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Latest issue</p>
            <p className="muted" style={{ fontSize: '.92rem' }}>
              #{product.issues[0].issue_number}: {product.issues[0].title}
            </p>
          </div>
        )}

        <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
          <EngagementBar product={product} onCommentClick={() => commentsRef.current?.scrollIntoView({ behavior: 'smooth' })} />
        </div>
      </div>

      <div className="buy-panel">
        <div className="card card--pad">
          <div className="order-summary">
            <div
              className="order-summary__cover"
              style={product.cover_path ? { backgroundImage: `url(${product.cover_path})` } : undefined}
            />
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 700, fontSize: '.95rem', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{product.title}</p>
              <p className="mono" style={{ fontWeight: 700, marginTop: 4 }}>
                {product.promo_active ? (
                  <>
                    <span style={{ color: 'var(--muted)', textDecoration: 'line-through', fontWeight: 500, marginRight: 8 }}>{price}</span>
                    <span style={{ color: 'var(--green-glow)' }}>{discountedPrice}</span>
                  </>
                ) : (
                  <span style={{ color: 'var(--green-glow)' }}>{product.pay_what_you_want ? `From ${price}` : price}</span>
                )}
                {product.type === 'serial' && <span className="muted" style={{ fontSize: '.78rem', fontWeight: 500 }}> / issue</span>}
              </p>
              {product.promo_active && product.discount_limit && (
                <p className="muted" style={{ fontSize: '.78rem', marginTop: 2 }}>
                  {Math.max(0, product.discount_limit - product.discount_claimed)} of {product.discount_limit} spots left at this price
                </p>
              )}
            </div>
          </div>

          {product.type === 'service' && (
            <div className="trust-line">
              <FiShield size={16} />
              <span>Payment is held safely until the seller delivers. You'll get a chance to confirm or report a problem before it's released to them.</span>
            </div>
          )}

          {product.type !== 'service' && !isOwner && (
            <div className="trust-line">
              <FiShield size={16} />
              <span>5-day buyer protection: not what you expected? Report it from your account within 5 days for a refund.</span>
            </div>
          )}

          {!!product.creator_verified && (
            <div className="trust-line">
              <FiShield size={16} />
              <span>Verified creator: a confirmed email, a payout number on file, and a track record of published products and completed orders.</span>
            </div>
          )}

          {!isOwner && product.type !== 'service' && (
            <ul className="buy-benefits">
              <li><FiZap size={14} /> Instant download the moment payment clears</li>
              {fileFormat && <li><FiFileText size={14} /> Delivered as {fileFormat}</li>}
              <li><FiLock size={14} /> Secure payment via EcoCash</li>
            </ul>
          )}

          {isOwner ? (
            <>
              <button onClick={shareProduct} className="btn btn--gold btn--block">
                {copied ? <><FiCheck size={15} /> Link copied</> : <><FiShare2 size={15} /> Share this product</>}
              </button>
              <Link to={`/dashboard/products/${product.id}/edit`} className="btn btn--ghost btn--block" style={{ marginTop: 10 }}>
                <FiEdit2 size={15} /> Edit this listing
              </Link>
            </>
          ) : (
            <>
              {soldOut ? (
                <p className="error-text">Sold out.</p>
              ) : (
                <>
                  <Link to={checkoutUrl} className="btn btn--gold btn--block">
                    {product.type === 'service' ? `Order for ${price}` : `Buy for ${product.promo_active ? discountedPrice : price}`}
                  </Link>
                  {!product.pay_what_you_want && product.type !== 'service' && (
                    <button onClick={handleAddToCart} className="btn btn--ghost btn--block" style={{ marginTop: 10 }}>
                      {addedToCart ? <><FiCheck size={15} /> Added to cart</> : <><FiShoppingCart size={15} /> Add to cart</>}
                    </button>
                  )}
                  {cartError && <p className="error-text" style={{ marginTop: 8 }}>{cartError}</p>}
                </>
              )}

              <Link
                to={product.category ? `/discover?category=${product.category}` : `/discover?type=${product.type}`}
                className="buy-panel__browse-link"
              >
                <FiCompass size={13} /> Browse similar products
              </Link>
            </>
          )}
        </div>
      </div>

      {moreFromCreator && moreFromCreator.length > 0 && (
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="rail-head">
            <h2 className="rail-head__title">More from {product.creator_name}</h2>
            <Link to={`/@${product.creator_handle}`} className="rail-head__link">View storefront</Link>
          </div>
          <div className="rail-wrap">
            <div className="rail">
              {moreFromCreator.map(p => <CompactProductCard key={p.id} product={p} />)}
            </div>
          </div>
        </div>
      )}

      <div style={{ gridColumn: '1 / -1' }}>
        <ReviewsSection productSlug={product.slug} />
        <CommentsSection ref={commentsRef} productId={product.id} />
      </div>
    </div>
  );
}
