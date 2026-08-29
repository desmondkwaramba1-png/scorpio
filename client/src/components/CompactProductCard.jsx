import { Link } from 'react-router-dom';
import { formatMoney } from '../lib/money';

// The homepage-rail card: small, square, scannable — a teaser meant to be
// swiped past quickly, not the full ProductCard (buy button, cart, likes,
// sold count) used on Discover/CreatorProfile where someone's actually
// comparing products. Click-through to the real product page is the only
// action here, same as tapping a tile in an Amazon carousel.
export default function CompactProductCard({ product: p }) {
  const productUrl = `/@${p.creator_handle}/${p.slug}`;
  return (
    <Link to={productUrl} className="compact-card">
      <div
        className={`compact-card__cover${p.cover_path ? '' : ' compact-card__cover--empty'}`}
        style={p.cover_path ? { backgroundImage: `url(${p.cover_path})` } : undefined}
      >
        {!p.cover_path && p.title.charAt(0).toUpperCase()}
        {p.promo_active && <span className="compact-card__badge">{p.discount_percent}% off</span>}
      </div>
      <div className="compact-card__body">
        <p className="compact-card__title">{p.title}</p>
        <p className="mono compact-card__price">
          {p.promo_active
            ? formatMoney(p.discounted_price_minor, p.currency)
            : p.pay_what_you_want ? `From ${formatMoney(p.price_minor, p.currency)}` : formatMoney(p.price_minor, p.currency)}
        </p>
      </div>
    </Link>
  );
}
