import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FiCheckCircle, FiXCircle, FiLoader, FiDownload, FiPlay, FiX, FiKey, FiCopy, FiCheck, FiShield } from 'react-icons/fi';
import { formatMoney } from '../lib/money';

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20; // ~1 minute of polling before giving up and asking the buyer to check again later

function ItemRow({ item }) {
  const [open, setOpen] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const price = formatMoney(item.amount_minor, item.currency);
  const productUrl = `/@${item.creator_handle}/${item.product_slug}`;

  async function copyKey() {
    await navigator.clipboard.writeText(item.license_key);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 1800);
  }

  return (
    <div className="card card--pad" style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <Link to={productUrl} style={{ fontWeight: 600 }}>{item.product_title}</Link>
          <p className="mono muted" style={{ fontSize: '.85rem' }}>{price}</p>
        </div>
        {item.download_url ? (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '100%' }}>
            {(item.is_video || item.is_audio) && (
              <button className="btn btn--ghost btn--sm" onClick={() => setOpen(o => !o)}>
                {open ? <><FiX size={14} /> Close</> : <><FiPlay size={14} /> {item.is_video ? 'Watch' : 'Play'}</>}
              </button>
            )}
            <a href={item.download_url} className="btn btn--gold btn--sm">
              <FiDownload size={14} /> Download
            </a>
          </div>
        ) : item.license_key || item.service ? null : (
          <span className="muted" style={{ fontSize: '.82rem' }}>No file attached. The creator will follow up.</span>
        )}
      </div>
      {item.service && item.service.fulfillment_status === 'awaiting_delivery' && (
        <div className="trust-line" style={{ marginTop: 14 }}>
          <FiShield size={16} />
          <span>
            Payment held safely until the seller delivers. You'll get an email, and a chance to confirm
            or report a problem, once they do. Track this order any time from{' '}
            <Link to="/account" style={{ fontWeight: 600 }}>your account</Link>.
          </span>
        </div>
      )}
      {item.service && item.service.fulfillment_status !== 'awaiting_delivery' && (
        <div className="trust-line" style={{ marginTop: 14 }}>
          <FiShield size={16} />
          <span>
            You have 5 days to make sure everything's right. Not what you expected? Report it from{' '}
            <Link to="/account" style={{ fontWeight: 600 }}>your account</Link> for a refund. After that
            it settles to the seller automatically.
          </span>
        </div>
      )}
      {item.license_key && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          marginTop: 14, padding: '9px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--field-bg)'
        }}>
          <span className="mono" style={{ fontSize: '.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FiKey size={13} color="var(--gold)" /> {item.license_key}
          </span>
          <button onClick={copyKey} className="btn btn--ghost btn--sm" style={keyCopied ? { color: 'var(--green-glow)' } : undefined}>
            {keyCopied ? <FiCheck size={13} /> : <FiCopy size={13} />} {keyCopied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      {open && item.view_url && item.is_video && (
        <video src={item.view_url} controls autoPlay style={{ width: '100%', borderRadius: 'var(--radius-sm)', marginTop: 14 }} />
      )}
      {open && item.view_url && item.is_audio && (
        <audio src={item.view_url} controls autoPlay style={{ width: '100%', marginTop: 14 }} />
      )}
    </div>
  );
}

export default function PaymentReturn() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('order_id');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const pollCount = useRef(0);

  useEffect(() => {
    if (!orderId) { setError('No order to check.'); return; }
    let cancelled = false;
    let timer;

    async function poll() {
      try {
        const res = await fetch(`/api/purchases/status/${orderId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Could not check payment status.');
        if (cancelled) return;
        setData(json);

        if (json.status === 'pending' && pollCount.current < MAX_POLLS) {
          pollCount.current += 1;
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    poll();

    return () => { cancelled = true; clearTimeout(timer); };
  }, [orderId]);

  if (error) {
    return (
      <div className="wrap" style={{ maxWidth: 480, padding: '80px 20px', textAlign: 'center' }}>
        <FiXCircle size={40} color="var(--red)" style={{ marginBottom: 14 }} />
        <h1 style={{ fontSize: '1.4rem', marginBottom: 10 }}>Something went wrong</h1>
        <p className="muted">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="wrap" style={{ maxWidth: 480, padding: '80px 20px', textAlign: 'center' }}>
        <FiLoader size={32} color="var(--muted)" style={{ marginBottom: 14 }} />
        <p className="muted">Checking your payment...</p>
      </div>
    );
  }

  const totalPrice = formatMoney(data.total_amount_minor, data.currency);
  const itemCount = data.items.length;
  const summary = itemCount === 1 ? data.items[0].product_title : `${itemCount} items`;

  if (data.status === 'paid') {
    return (
      <div className="wrap" style={{ maxWidth: 480, padding: '80px 20px', textAlign: 'center' }}>
        <FiCheckCircle size={40} color="var(--green)" style={{ marginBottom: 14 }} />
        <h1 style={{ fontSize: '1.4rem', marginBottom: 8 }}>Payment confirmed</h1>
        <p className="muted" style={{ marginBottom: 24 }}>{summary} &middot; {totalPrice}</p>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {data.items.map(item => <ItemRow key={item.product_slug} item={item} />)}
        </div>

        <p style={{ marginTop: 20 }}>
          <Link to="/account" style={{ color: 'var(--green)', fontWeight: 600, fontSize: '.9rem' }}>View all your orders</Link>
        </p>
      </div>
    );
  }

  if (data.status === 'failed') {
    return (
      <div className="wrap" style={{ maxWidth: 480, padding: '80px 20px', textAlign: 'center' }}>
        <FiXCircle size={40} color="var(--red)" style={{ marginBottom: 14 }} />
        <h1 style={{ fontSize: '1.4rem', marginBottom: 8 }}>Payment didn't go through</h1>
        <p className="muted" style={{ marginBottom: 24 }}>{summary} &middot; {totalPrice}</p>
        {itemCount === 1 ? (
          <Link to={`/@${data.items[0].creator_handle}/${data.items[0].product_slug}`} className="btn btn--primary">Try again</Link>
        ) : (
          <Link to="/discover" className="btn btn--primary">Back to the marketplace</Link>
        )}
      </div>
    );
  }

  // pending, still polling (or gave up after MAX_POLLS)
  const gaveUp = pollCount.current >= MAX_POLLS;
  return (
    <div className="wrap" style={{ maxWidth: 480, padding: '80px 20px', textAlign: 'center' }}>
      <FiLoader size={32} color="var(--muted)" style={{ marginBottom: 14 }} />
      <h1 style={{ fontSize: '1.4rem', marginBottom: 8 }}>
        {gaveUp ? "Still waiting on Dischub" : 'Confirming your payment'}
      </h1>
      <p className="muted" style={{ marginBottom: 20 }}>{summary} &middot; {totalPrice}</p>
      <p className="muted" style={{ fontSize: '.88rem' }}>
        {gaveUp
          ? 'This is taking longer than usual. Check your account in a few minutes, or refresh this page to check again.'
          : "Didn't get a prompt yet? Check your phone for an EcoCash confirmation."}
      </p>
    </div>
  );
}
