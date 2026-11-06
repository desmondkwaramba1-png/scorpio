import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FiCheckCircle, FiXCircle, FiLoader, FiDownload, FiPlay, FiX, FiKey, FiCopy, FiCheck, FiShield, FiBookOpen, FiExternalLink } from 'react-icons/fi';
import { formatMoney } from '../lib/money';
import DocumentViewer from '../components/DocumentViewer.jsx';

const FAST_POLL_INTERVAL_MS = 3000;
const SLOW_POLL_INTERVAL_MS = 20000;
const FAST_POLL_COUNT = 20;
const MAX_POLLS = 45; // Keep checking for several minutes without exhausting the status-route rate limit.

function ItemRow({ item }) {
  const [open, setOpen] = useState(!!item.view_url && !item.is_external);
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
        {item.download_url || item.view_url || ['serial', 'subscription'].includes(item.product_type) ? (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '100%' }}>
            {['serial', 'subscription'].includes(item.product_type) && (
              <Link to={`${productUrl}#issues-section`} className="btn btn--cta btn--sm">
                <FiBookOpen size={14} /> View issues
              </Link>
            )}
            {item.view_url && item.is_external && (
              <a href={item.view_url} target="_blank" rel="noopener noreferrer" className="btn btn--cta btn--sm">
                <FiExternalLink size={14} /> Open
              </a>
            )}
            {item.view_url && (item.is_video || item.is_audio) && (
              <button className="btn btn--ghost btn--sm" onClick={() => setOpen(o => !o)}>
                {open ? <><FiX size={14} /> Close</> : <><FiPlay size={14} /> {item.is_video ? 'Watch' : 'Play'}</>}
              </button>
            )}
            {item.view_url && !item.is_video && !item.is_audio && !item.is_external && (
              <button className="btn btn--ghost btn--sm" onClick={() => setOpen(o => !o)}>
                {open ? <><FiX size={14} /> Close</> : <><FiBookOpen size={14} /> Read / View</>}
              </button>
            )}
            {item.download_url && (
              <a href={item.download_url} className="btn btn--cta btn--sm">
                <FiDownload size={14} /> Download now
              </a>
            )}
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
            <FiKey size={13} color="var(--accent-icon)" /> {item.license_key}
          </span>
          <button onClick={copyKey} className="btn btn--ghost btn--sm" style={keyCopied ? { color: 'var(--brand-strong)' } : undefined}>
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
      {open && item.view_url && !item.is_video && !item.is_audio && !item.is_external && (
        <DocumentViewer src={item.view_url} title={item.product_title} downloadUrl={item.download_url} />
      )}
    </div>
  );
}

export default function PaymentReturn() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('order_id');
  const checkingPrompt = searchParams.get('checking') === '1';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [pollError, setPollError] = useState(null);
  const pollCount = useRef(0);

  useEffect(() => {
    if (!orderId) { setError('No order to check.'); return; }
    let cancelled = false;
    let timer;
    pollCount.current = 0;
    setData(null);
    setError(null);
    setPollError(null);

    async function poll() {
      try {
        const res = await fetch(`/api/purchases/status/${orderId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Could not check payment status.');
        if (cancelled) return;
        setData(json);
        setPollError(null);

        if (json.status === 'pending' && pollCount.current < MAX_POLLS) {
          pollCount.current += 1;
          const interval = pollCount.current < FAST_POLL_COUNT
            ? FAST_POLL_INTERVAL_MS
            : SLOW_POLL_INTERVAL_MS;
          timer = setTimeout(poll, interval);
        }
      } catch (err) {
        if (!cancelled) {
          setPollError(err.message);
          if (pollCount.current < MAX_POLLS) {
            pollCount.current += 1;
            timer = setTimeout(poll, SLOW_POLL_INTERVAL_MS);
          }
        }
      }
    }
    poll();

    return () => { cancelled = true; clearTimeout(timer); };
  }, [orderId]);

  if (error) {
    return (
      <div className="wrap center-page" style={{ maxWidth: 480, padding: 20 }}>
        <FiXCircle size={40} color="var(--red)" style={{ marginBottom: 14 }} />
        <h1 style={{ fontSize: '1.4rem', marginBottom: 10 }}>Something went wrong</h1>
        <p className="muted">{error}</p>
      </div>
    );
  }

  if (!data) {
    const gaveUp = pollCount.current >= MAX_POLLS;
    return (
      <div className="wrap center-page" style={{ maxWidth: 480, padding: 20 }}>
        {gaveUp ? (
          <>
            <FiXCircle size={40} color="var(--red)" style={{ marginBottom: 14 }} />
            <h1 style={{ fontSize: '1.4rem', marginBottom: 10 }}>We couldn't reach the payment check</h1>
            <p className="muted">{pollError || 'Your payment status is not confirmed yet. Check again before starting another payment.'}</p>
            <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 18 }}
              onClick={() => window.location.reload()}>
              Check payment again
            </button>
          </>
        ) : (
          <>
            <FiLoader size={32} color="var(--muted)" style={{ marginBottom: 14 }} />
            <p className="muted">{pollError ? 'Connection interrupted. Retrying your payment check...' : 'Checking your payment...'}</p>
          </>
        )}
      </div>
    );
  }

  const totalPrice = formatMoney(data.total_amount_minor, data.currency);
  const itemCount = data.items.length;
  const summary = itemCount === 1 ? data.items[0].product_title : `${itemCount} items`;

  if (data.status === 'paid') {
    return (
      <div className="wrap center-page" style={{ maxWidth: 480, padding: 20 }}>
        <FiCheckCircle size={40} color="var(--success)" style={{ marginBottom: 14 }} />
        <h1 style={{ fontSize: '1.4rem', marginBottom: 8 }}>Payment confirmed</h1>
        <p className="muted" style={{ marginBottom: 24 }}>{summary} &middot; {totalPrice}</p>
        <p className="muted" style={{ marginBottom: 16 }}>Your content is ready below. Read or watch it here, or download a copy.</p>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {data.login_required ? (
              <div className="card card--pad">
                <p style={{ marginBottom: 14 }}>Log in to the account you paid with to open what you bought.</p>
                <Link to={`/login?next=${encodeURIComponent(`/payment/return?order_id=${orderId}`)}`} className="btn btn--cta">Log in</Link>
              </div>
            ) : data.items.map(item => <ItemRow key={item.product_slug} item={item} />)}
        </div>

        <p style={{ marginTop: 20 }}>
          <Link to="/account" style={{ color: 'var(--brand)', fontWeight: 600, fontSize: '.9rem' }}>View all your orders</Link>
        </p>
      </div>
    );
  }

  if (data.status === 'failed') {
    return (
      <div className="wrap center-page" style={{ maxWidth: 480, padding: 20 }}>
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
    <div className="wrap center-page" style={{ maxWidth: 480, padding: 20 }}>
      <FiLoader size={32} color="var(--muted)" style={{ marginBottom: 14 }} />
      <h1 style={{ fontSize: '1.4rem', marginBottom: 8 }}>
        {gaveUp ? "Still waiting on Dischub" : 'Confirming your payment'}
      </h1>
      <p className="muted" style={{ marginBottom: 20 }}>{summary} &middot; {totalPrice}</p>
      <p className="muted" style={{ fontSize: '.88rem' }}>
        {gaveUp
          ? 'This is taking longer than usual. Check your EcoCash message. You can safely check this order again below; do not pay for it a second time.'
          : checkingPrompt
            ? 'We are confirming whether the EcoCash prompt was sent. Please wait here and do not start another payment for this order.'
            : "Didn't get a prompt yet? Check your phone for an EcoCash confirmation."}
      </p>
      {pollError && !gaveUp && (
        <p className="muted" style={{ fontSize: '.8rem', marginTop: 10 }}>Connection interrupted. We will keep checking automatically.</p>
      )}
      <p className="muted" style={{ fontSize: '.82rem', marginTop: 16, lineHeight: 1.5 }}>
        Approved the EcoCash prompt already? You can safely leave this page. We keep checking, and your purchase
        will appear under <Link to="/account" style={{ fontWeight: 700 }}>My orders</Link> as soon as the payment clears.
      </p>
      {gaveUp && (
        <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 18 }}
          onClick={() => window.location.reload()}>
          Check payment again
        </button>
      )}
    </div>
  );
}
