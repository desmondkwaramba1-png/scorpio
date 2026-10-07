import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { FiShield, FiCompass, FiShare2, FiCheck, FiEdit2, FiShoppingCart, FiLock, FiZap, FiFileText, FiPlay, FiDownload, FiPackage, FiBookOpen, FiExternalLink, FiKey, FiX } from 'react-icons/fi';
import Seal from '../components/Seal.jsx';
import EngagementBar from '../components/EngagementBar.jsx';
import CommentsSection from '../components/CommentsSection.jsx';
import ReviewsSection, { Stars } from '../components/ReviewsSection.jsx';
import CompactProductCard from '../components/CompactProductCard.jsx';
import ReportProblem from '../components/ReportProblem.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { api } from '../lib/api';
import { formatMoney } from '../lib/money';
import { CATEGORY_LABELS } from '../lib/categories.js';
import { shareOrCopy } from '../lib/share';
import { useSEO } from '../lib/seo';
import { SITE_ORIGIN } from '../lib/site';
import { timeAgo } from '../lib/time';

// A short extension read off the actual uploaded file, not a guess, real
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

// A raw "Get it" link forced a save-to-disk prompt no matter what the
// issue actually was — a video issue couldn't just be watched, a PDF
// couldn't just be read, both had to be downloaded first and opened in
// a separate app. Same fix as Account.jsx's OrderRow already applies to
// regular purchases: watch/listen inline for media, and for anything
// else, an embedded viewer instead of forcing a download to see it at all.
function IssueRow({ iss, focused }) {
  const [expanded, setExpanded] = useState(false);
  const rowRef = useRef(null);

  // Jumping here from the buy panel's "latest issue" button should land
  // the buyer already reading/watching it, not just scrolled to a list
  // they then have to click into themselves - that extra click was the
  // whole reason the old plain scroll button felt pointless.
  useEffect(() => {
    if (focused && iss.unlocked) {
      setExpanded(true);
      rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focused, iss.unlocked]);

  if (!iss.unlocked) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)'
      }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 600, fontSize: '.9rem' }}>Issue {iss.issue_number}: {iss.title}</p>
          <p className="muted" style={{ fontSize: '.78rem' }}>{new Date(iss.published_at).toLocaleDateString()}</p>
        </div>
        <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.82rem', flexShrink: 0 }}>
          <FiLock size={12} /> Locked
        </span>
      </div>
    );
  }

  // An uploaded file lives on R2, a domain this app controls, so an
  // <iframe> embed of it is reliable. An external link (a creator's own
  // Google Drive/YouTube/whatever) is not — plenty of sites refuse to be
  // framed at all (X-Frame-Options/CSP), so that one opens in a real new
  // tab instead of risking a blank embedded box.
  const isExternal = iss.kind === 'external_link';
  const label = iss.is_video ? 'Watch' : iss.is_audio ? 'Listen' : isExternal ? 'Open' : 'Read';

  return (
    <div ref={rowRef} style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 600, fontSize: '.9rem' }}>Issue {iss.issue_number}: {iss.title}</p>
          <p className="muted" style={{ fontSize: '.78rem' }}>{new Date(iss.published_at).toLocaleDateString()}</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {isExternal ? (
            <a href={iss.view_url} target="_blank" rel="noopener noreferrer" className="btn btn--gold btn--sm">
              <FiPlay size={13} /> {label}
            </a>
          ) : (
            <>
              <button type="button" onClick={() => setExpanded(e => !e)} className="btn btn--gold btn--sm">
                {expanded ? <FiCheck size={13} /> : <FiPlay size={13} />} {expanded ? 'Close' : label}
              </button>
              <a href={`/api/downloads/issue/${iss.id}`} className="btn btn--ghost btn--sm" title="Download instead">
                <FiDownload size={13} />
              </a>
            </>
          )}
        </div>
      </div>

      {expanded && !isExternal && iss.is_video && (
        <video src={iss.view_url} controls playsInline style={{ width: '100%', borderRadius: 'var(--radius-sm)', marginTop: 12, background: '#000' }} />
      )}
      {expanded && !isExternal && iss.is_audio && (
        <audio src={iss.view_url} controls style={{ width: '100%', marginTop: 12 }} />
      )}
      {expanded && !isExternal && !iss.is_video && !iss.is_audio && (
        <iframe src={iss.view_url} title={iss.title} style={{ width: '100%', height: 500, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', marginTop: 12 }} />
      )}
    </div>
  );
}

// A view page, not a checkout form, clicking a product to see what it is
// shouldn't force a payment form in front of you. Buying is an explicit
// next step (its own page, its own URL) for people who've decided they want it.
export default function Product() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromLibrary = searchParams.get('from') === 'library';
  const { user, creator } = useAuth();
  const { addToCart } = useCart();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [justAddedFresh, setJustAddedFresh] = useState(false);
  const [cartError, setCartError] = useState(null);
  const [focusIssueId, setFocusIssueId] = useState(null);
  const [ownedContentOpen, setOwnedContentOpen] = useState(false);
  const [ownershipLoading, setOwnershipLoading] = useState(false);
  const [moreFromCreator, setMoreFromCreator] = useState(null);
  const [productReel, setProductReel] = useState(null);
  const commentsRef = useRef(null);

  useEffect(() => {
    setProduct(null);
    setError(null);
    setMoreFromCreator(null);
    setProductReel(null);
    api.get(`/api/reels?product=${slug}&limit=1`).then(reels => setProductReel(reels[0] || null)).catch(() => {});
    api.get(`/api/products/${slug}`)
      .then(product => {
        setProduct(product);
        setAddedToCart(!!product.in_cart);
        setOwnedContentOpen(!!product.already_purchased && !['serial', 'subscription', 'service'].includes(product.type));
        // /api/creators/:handle doesn't repeat creator_handle on each
        // product row (every item in that list is obviously the same
        // creator), CompactProductCard needs it to build a link, so it's
        // stitched back on here from the outer product we already have.
        api.get(`/api/creators/${product.creator_handle}`)
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

  useEffect(() => {
    if (!user || !product || creator?.id === product.creator_id) return;
    if (['serial', 'subscription'].includes(product.type)) return;
    if (product.already_purchased && product.owned_access) return;

    let cancelled = false;
    setOwnershipLoading(true);
    api.get('/api/purchases/mine').then(purchases => {
      const purchase = purchases.find(item =>
        item.product_id === product.id &&
        item.payment_status === 'paid' &&
        item.fulfillment_status !== 'refunded'
      );
      if (!purchase || cancelled) return;

      setProduct(current => current?.id === product.id ? {
        ...current,
        already_purchased: true,
        owned_access: {
          download_url: purchase.download_url,
          view_url: purchase.view_url,
          is_video: purchase.is_video,
          is_audio: purchase.is_audio,
          is_external: purchase.is_external,
          license_key: purchase.license_key
        }
      } : current);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setOwnershipLoading(false);
    });

    return () => { cancelled = true; };
  }, [user?.id, creator?.id, product?.id, product?.creator_id, product?.type, product?.already_purchased]);

  // Called unconditionally, before the early returns below, a hook can
  // never sit after a return that only fires on some renders (the loading
  // skeleton fires on the very first render, before `product` exists, then
  // never again once it loads), or React throws "rendered more hooks than
  // during the previous render" (error #310) the moment the count changes.
  const productUrlForSeo = product ? `/@${product.creator_handle}/${product.slug}` : null;
  useSEO({
    title: product ? `${product.title} by ${product.creator_name}, SCORPIO` : undefined,
    description: product
      ? (product.description
        ? product.description.slice(0, 160)
        : `${product.title}, ${formatMoney(product.price_minor, product.currency)} on SCORPIO. Real work from ${product.creator_name}, not scraped off the internet.`)
      : undefined,
    image: product?.cover_path,
    url: productUrlForSeo ? `${SITE_ORIGIN}${productUrlForSeo}` : undefined,
    // Demo/seed listings are real pages (see scripts/seed-marketplace.js)
    // but templated, near-duplicate content across ~200 of them, kept out
    // of the sitemap for the same reason, and told not to index here too,
    // in case Discover's internal links get one crawled anyway.
    noindex: product?.creator_handle?.startsWith('demo-'),
    jsonLd: product ? {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.title,
      description: product.description || undefined,
      image: product.cover_path ? [product.cover_path] : undefined,
      brand: { '@type': 'Brand', name: product.creator_name },
      offers: {
        '@type': 'Offer',
        url: `${SITE_ORIGIN}${productUrlForSeo}`,
        priceCurrency: product.currency,
        price: (product.price_minor / 100).toFixed(2),
        availability: product.quantity_limit !== null && product.quantity_sold >= product.quantity_limit
          ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
        // Real policy, not a placeholder to satisfy the checker, the exact
        // same 5-day window every purchase confirmation and Account.jsx's
        // ServiceStatus already tell a buyer about: report a problem within
        // 5 days for a refund, after that it settles to the seller. Applies
        // uniformly whether the order is a digital good or a service.
        hasMerchantReturnPolicy: {
          '@type': 'MerchantReturnPolicy',
          returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
          merchantReturnDays: 5,
          returnFees: 'https://schema.org/FreeReturn'
        },
        // Instant for a real digital download or unlocked issue (single/
        // serial), a real turnaround estimate for a service, only when the
        // creator actually gave one, guessing a number here would be worse
        // than the field simply not appearing.
        ...(product.type === 'service'
          ? (product.delivery_days ? {
              shippingDetails: {
                '@type': 'OfferShippingDetails',
                shippingRate: { '@type': 'MonetaryAmount', value: '0', currency: product.currency },
                shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'ZW' },
                deliveryTime: {
                  '@type': 'ShippingDeliveryTime',
                  handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 0, unitCode: 'DAY' },
                  transitTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: product.delivery_days, unitCode: 'DAY' }
                }
              }
            } : {})
          : {
              shippingDetails: {
                '@type': 'OfferShippingDetails',
                shippingRate: { '@type': 'MonetaryAmount', value: '0', currency: product.currency },
                shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'ZW' },
                deliveryTime: {
                  '@type': 'ShippingDeliveryTime',
                  handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 0, unitCode: 'DAY' },
                  transitTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 0, unitCode: 'DAY' }
                }
              }
            })
      },
      ...(product.review_count > 0 ? {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: product.avg_rating,
          reviewCount: product.review_count,
        },
      } : {}),
    } : undefined
  });

  if (error) {
    return <div className="wrap center-page" style={{ padding: 20 }}><p className="error-text">{error}</p></div>;
  }
  // Just !product, not authLoading too — the auth check has nothing to do
  // with whether THIS page's own content is ready, and isOwner/user below
  // already handle a not-yet-resolved creator/user as a plain falsy
  // default (the correct assumption while it's still loading). Gating the
  // whole page on it added a real, needless delay: on a slower connection
  // the auth check and the product fetch race in parallel, and this used
  // to wait for whichever was slower even though the product content was
  // already sitting there ready.
  if (!product) {
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
  const price = product.price_minor === 0 ? 'Free' : formatMoney(product.price_minor, product.currency);
  const discountedPrice = product.promo_active ? formatMoney(product.discounted_price_minor, product.currency) : null;
  const productUrl = `/@${product.creator_handle}/${product.slug}`;
  const checkoutUrl = `${productUrl}/checkout`;
  const isOwner = creator?.id === product.creator_id;
  const fileFormat = fileFormatLabel(product.files);
  const buyLabel = product.type === 'service' ? `Order for ${price}`
    : product.type === 'subscription' ? `Subscribe for ${price}/month`
    : product.price_minor === 0 ? 'Get for free'
    : `Buy for ${product.promo_active ? discountedPrice : price}`;

  // Used to revert back to "Add to cart" on a timer regardless of
  // whether the item was actually still in the cart — real, confirmed:
  // the button flashed "Added" then reset itself a couple seconds later
  // even though nothing about the cart had changed, inviting a second,
  // pointless click. Once it's genuinely in the cart, the button just
  // says so and stays that way (see product.in_cart above, checked on
  // page load too) — the only way it goes back to "Add to cart" is
  // actually removing it, from the real cart page.
  async function handleAddToCart() {
    if (!user) { navigate(`/login?role=buyer&next=${encodeURIComponent(productUrl)}`); return; }
    if (addedToCart) return;
    try {
      const data = await addToCart(product.slug);
      setAddedToCart(true);
      setJustAddedFresh(!data.already_in_cart);
      setTimeout(() => setJustAddedFresh(false), 1800);
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
      {/* Its own grid area now (see .product-layout's grid-template-areas),
          not the top of the "main content" column — on mobile that's what
          actually lets the buy panel land right after it, real page space
          instead of the floating bar this used to need to fake quick
          access to buying. */}
      <div className="product-layout__cover-col">
        <div className="product-cover">
          {product.cover_path && (
            <>
              {/* Blurred fill behind the real, sharp, uncropped cover — most
                  covers are book/course-style portrait or square art, not
                  literally 16/9, so without this they'd sit centered on
                  flat empty color bars instead of a frame that actually
                  feels designed around the artwork. */}
              <div className="product-cover__backdrop" style={{ backgroundImage: `url(${product.cover_path})` }} />
              <div className="product-cover__image" style={{ backgroundImage: `url(${product.cover_path})` }} />
            </>
          )}
          {product.creator_avatar && (
            <div className="product-cover__watermark" style={{ backgroundImage: `url(${product.creator_avatar})` }} />
          )}
        </div>
      </div>

      <div className="product-layout__content">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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

        {/* At most one video here, never both, a product with both a
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

        {/* Was gated to 'serial' only — a subscription's content arrives
            through this exact same issues mechanism (see products.js),
            so a subscriber had nowhere on this page to actually see what
            they were getting, or that anything had been published at all. */}
        {['serial', 'subscription'].includes(product.type) && (
          <div id="issues-section" className="card card--pad" style={{ marginTop: 28 }}>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>Issues</p>
            <p className="muted" style={{ fontSize: '.85rem', marginBottom: 4 }}>
              {product.type === 'subscription'
                ? (product.issues?.some(i => i.unlocked)
                  ? "You've got every issue below while your subscription stays active."
                  : 'Every issue published here is included while your subscription is active.')
                : (product.issues?.some(i => i.unlocked)
                  ? "You've got every issue below, and every one still to come."
                  : 'Buy once, get every issue published here from then on, no separate charge per chapter.')}
            </p>
            {/* A buyer deciding whether to pay for an ongoing series has no
                way to judge if it's actually still active — this is the
                same information a seller sees on their own dashboard,
                surfaced here so it's an informed decision, not a guess. */}
            <p className="muted" style={{ fontSize: '.8rem', marginBottom: 14 }}>
              {product.issues && product.issues.length > 0
                ? `Latest: issue ${product.issues[0].issue_number}, ${timeAgo(product.issues[0].published_at)}`
                : `Listed ${timeAgo(product.created_at)}, no issues published yet`}
            </p>
            {isOwner && (
              <Link to={`/dashboard/products/${product.id}/issues`} className="btn btn--ghost btn--sm" style={{ marginBottom: 14 }}>
                <FiEdit2 size={13} /> Manage issues
              </Link>
            )}
            {!product.issues || product.issues.length === 0 ? (
              <p className="muted" style={{ fontSize: '.88rem' }}>Nothing published yet, check back soon.</p>
            ) : (
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
                {product.issues.map(iss => <IssueRow key={iss.id} iss={iss} focused={iss.id === focusIssueId} />)}
              </div>
            )}
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
                {product.type === 'serial' && (
                  <span className="muted" style={{ fontSize: '.78rem', fontWeight: 500 }}> once, unlocks every issue</span>
                )}
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

          {product.type !== 'service' && !isOwner && !product.already_purchased && (
            <div className="trust-line">
              <FiShield size={16} />
              <span>5-day buyer protection: not what you expected? Report it from your account within 5 days for a refund.</span>
            </div>
          )}

          {/* Trust signals exist to help a prospective buyer decide -
              once they already own it (or it's their own listing), "is
              this seller trustworthy" isn't a live question anymore,
              just noise between them and actually getting to their
              content. */}
          {!!product.creator_verified && !isOwner && !product.already_purchased && (
            <div className="trust-line">
              <FiShield size={16} />
              <span>Verified creator: a confirmed email, a payout number on file, and a track record of published products and completed orders.</span>
            </div>
          )}

          {!isOwner && product.type !== 'service' && !product.already_purchased && (
            <ul className="buy-benefits">
              <li><FiZap size={14} /> Instant download the moment payment clears</li>
              {fileFormat && <li><FiFileText size={14} /> Delivered as {fileFormat}</li>}
              <li><FiLock size={14} /> Secure payment via EcoCash</li>
            </ul>
          )}

          {/* Every type had nothing telling a buyer revisiting something
              they'd already bought (their own library, a shared link,
              anywhere) that they owned it - same buy CTA a stranger
              would see, which read as "buy this again." Serial/
              subscription get a different second line and button on
              purpose: the actual content (the issues list, "Get it"
              links) is already further down THIS SAME page - sending
              them to /account first, only to have nothing to do there
              but come back here, was a real dead-end loop, confirmed
              live. Single/service genuinely have nowhere else on this
              page to get the file/access from, so /account is correct
              for those. */}
          {!isOwner && product.already_purchased ? (
            <>
              {product.type === 'service' ? (
                <div className="trust-line" style={{ color: 'var(--ink-dim)' }}>
                  <FiShield size={16} />
                  <span>This is a service order, not an instant download. Track delivery and access delivered files in your library.</span>
                  <Link to="/account" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Open library</Link>
                </div>
              ) : ['serial', 'subscription'].includes(product.type) ? (
                <>
                  <div className="trust-line" style={{ color: 'var(--green-glow)', fontWeight: 600 }}>
                    <FiCheck size={16} /><span>You already own this.</span>
                  </div>
                  {product.issues && product.issues.length > 0 ? (
                    <button
                      type="button"
                      className="btn btn--gold btn--block"
                      onClick={() => {
                        setFocusIssueId(product.issues[0].id);
                        document.getElementById('issues-section')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      {product.issues[0].is_video || product.issues[0].is_audio
                        ? <FiPlay size={15} /> : <FiFileText size={15} />}
                      {product.issues[0].is_video ? 'Watch' : product.issues[0].is_audio ? 'Listen to' : 'Read'}
                      {' '}"Issue {product.issues[0].issue_number}: {product.issues[0].title}"
                    </button>
                  ) : (
                    <p className="muted" style={{ fontSize: '.85rem' }}>
                      No issues published yet — they'll show up here the moment the creator posts one.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="trust-line" style={{ color: 'var(--green-glow)', fontWeight: 600 }}>
                    <FiCheck size={16} /><span>You own this product. Access it here or download a copy.</span>
                  </div>
                  {product.owned_access?.is_external && product.owned_access.view_url && (
                    <a href={product.owned_access.view_url} target="_blank" rel="noopener noreferrer" className="btn btn--gold btn--block">
                      <FiExternalLink size={15} /> Open your content
                    </a>
                  )}
                  {product.owned_access?.view_url && !product.owned_access.is_external && (
                    <button type="button" className="btn btn--gold btn--block" onClick={() => setOwnedContentOpen(open => !open)}>
                      {ownedContentOpen ? <FiX size={15} /> : product.owned_access.is_video || product.owned_access.is_audio ? <FiPlay size={15} /> : <FiBookOpen size={15} />}
                      {ownedContentOpen ? 'Close content' : product.owned_access.is_video ? 'Watch now' : product.owned_access.is_audio ? 'Listen now' : 'Read now'}
                    </button>
                  )}
                  {product.owned_access?.download_url && (
                    <a href={product.owned_access.download_url} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--block" style={{ marginTop: 8 }}>
                      <FiDownload size={15} /> Download now
                    </a>
                  )}
                  {product.owned_access?.license_key && (
                    <p className="mono" style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'var(--field-bg)', overflowWrap: 'anywhere' }}>
                      <FiKey size={14} /> {product.owned_access.license_key}
                    </p>
                  )}
                  {ownedContentOpen && product.owned_access?.view_url && !product.owned_access.is_external && (
                    product.owned_access.is_video ? (
                      <video src={product.owned_access.view_url} controls playsInline style={{ width: '100%', marginTop: 12, borderRadius: 8, background: '#000' }} />
                    ) : product.owned_access.is_audio ? (
                      <audio src={product.owned_access.view_url} controls style={{ width: '100%', marginTop: 12 }} />
                    ) : (
                      <iframe src={product.owned_access.view_url} title={product.title} className="library-file-viewer" />
                    )
                  )}
                  {!product.owned_access?.view_url && !product.owned_access?.download_url && !product.owned_access?.license_key && (
                    <p className="muted" style={{ fontSize: '.84rem', marginTop: 10 }}>No file is attached to this product yet. Contact the creator from your order in the library.</p>
                  )}
                  <Link to="/account" className="buy-panel__browse-link"><FiPackage size={14} /> View your library order</Link>
                </>
              )}
            </>
          ) : isOwner ? (
            <>
              <button onClick={shareProduct} className="btn btn--gold btn--block">
                {copied ? <><FiCheck size={15} /> Link copied</> : <><FiShare2 size={15} /> Share this product</>}
              </button>
              <Link to={`/dashboard/products/${product.id}/edit`} className="btn btn--ghost btn--block" style={{ marginTop: 10 }}>
                <FiEdit2 size={15} /> Edit this listing
              </Link>
            </>
          ) : !isOwner && fromLibrary ? (
            <div className="trust-line" role="status" style={{ margin: 0 }}>
              <FiPackage size={16} />
              <span>
                {ownershipLoading
                  ? 'Checking your library access…'
                  : 'We could not match this product to an order on this account. Open your library or sign in with the account used at checkout.'}
              </span>
              {!ownershipLoading && <Link to="/account" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Library</Link>}
            </div>
          ) : (
            <>
              {soldOut ? (
                <p className="error-text">Sold out.</p>
              ) : (
                <>
                  <Link to={checkoutUrl} className="btn btn--gold btn--block">
                    {buyLabel}
                  </Link>
                  {!product.pay_what_you_want && product.price_minor !== 0 && product.type !== 'service' && (
                    <button
                      onClick={handleAddToCart}
                      className="btn btn--ghost btn--block"
                      style={{ marginTop: 10, ...(addedToCart ? { cursor: 'default' } : {}) }}
                    >
                      {addedToCart
                        ? <><FiCheck size={15} /> {justAddedFresh ? 'Added to cart' : 'Already in cart'}</>
                        : <><FiShoppingCart size={15} /> Add to cart</>}
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
        {/* Not gated on having bought this, the case this exists for
            (another seller flagging a copied/similar listing) is exactly
            someone who never bought it and shouldn't have to. */}
        {user && !isOwner && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <ReportProblem productId={product.id} label="Report this listing" />
          </div>
        )}
      </div>
    </div>
  );
}
