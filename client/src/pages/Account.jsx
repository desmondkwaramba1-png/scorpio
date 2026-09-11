import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiDownload, FiRefreshCw, FiUser, FiPackage, FiCompass, FiPlay, FiX, FiCamera, FiKey, FiCopy, FiCheck, FiShield, FiAlertTriangle, FiExternalLink, FiMail, FiMessageCircle, FiClock, FiDollarSign } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api';
import { formatMoney } from '../lib/money';
import ThemeToggle from '../components/ThemeToggle.jsx';
import ReportProblem from '../components/ReportProblem.jsx';

function formatDate(sqliteDatetime) {
  const d = new Date(sqliteDatetime.replace(' ', 'T'));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const FULFILLMENT_LABEL = {
  awaiting_delivery: { text: 'In progress', className: 'badge--gold' },
  delivered: { text: 'Awaiting your OK', className: 'badge--gold' },
  released: { text: 'Completed', className: 'badge--green' },
  disputed: { text: 'Under review', className: 'badge--neutral' },
  refunded: { text: 'Refunded', className: 'badge--neutral' }
};

// wa.me needs digits only, country code first, no leading zero on the
// trunk digit, Zimbabwean numbers arrive as 07..., 2637..., or +2637...
function whatsappLink(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const withCountryCode = digits.startsWith('263') ? digits : `263${digits.replace(/^0/, '')}`;
  return `https://wa.me/${withCountryCode}`;
}

function ServiceStatus({ purchaseId, service: initial, sellerName, sellerEmail, sellerPhone, productTitle }) {
  const [service, setService] = useState(initial);
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

  async function confirm(e) {
    e.stopPropagation();
    setSubmitting(true);
    setActionError(null);
    try {
      await api.post(`/api/purchases/${purchaseId}/confirm`);
      setService(s => ({ ...s, fulfillment_status: 'released' }));
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitDispute(e) {
    e.preventDefault();
    e.stopPropagation();
    setSubmitting(true);
    setActionError(null);
    try {
      await api.post(`/api/purchases/${purchaseId}/dispute`, { reason });
      setService(s => ({ ...s, fulfillment_status: 'disputed' }));
      setDisputing(false);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!service) return null;

  const stillWaiting = service.fulfillment_status === 'awaiting_delivery' || service.fulfillment_status === 'delivered';
  const expectedBy = service.expected_by ? new Date(service.expected_by) : null;
  const isLate = expectedBy && stillWaiting && expectedBy < new Date();
  const wa = whatsappLink(sellerPhone);

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }} onClick={e => e.stopPropagation()}>
      {service.fulfillment_status === 'awaiting_delivery' && (
        <p className="trust-line" style={{ margin: 0 }}>
          <FiShield size={16} /> <span>Your payment is held safely until the seller delivers.</span>
        </p>
      )}

      {service.fulfillment_status === 'delivered' && !service.delivery && (
        <p className="trust-line" style={{ margin: 0 }}>
          <FiShield size={16} /> <span>You have 5 days to report a problem with this order. After that it settles to the seller automatically.</span>
        </p>
      )}

      {expectedBy && stillWaiting && (
        <p className={isLate ? 'error-text' : 'muted'} style={{ fontSize: '.82rem', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FiClock size={13} />
          {isLate
            ? `Expected by ${expectedBy.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. That's passed. You can report this order below for a refund.`
            : `Expected by ${expectedBy.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
        </p>
      )}

      {(service.fulfillment_status === 'delivered' || service.fulfillment_status === 'released') && service.delivery && (
        <div style={{ marginBottom: service.fulfillment_status === 'delivered' ? 12 : 0, marginTop: 10 }}>
          <p style={{ fontSize: '.88rem', fontWeight: 600, marginBottom: 4 }}>What the seller delivered:</p>
          <p className="muted" style={{ fontSize: '.88rem', lineHeight: 1.5 }}>{service.delivery.message}</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            {service.delivery.external_url && (
              <a href={service.delivery.external_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.85rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <FiExternalLink size={12} /> Open link
              </a>
            )}
            {service.delivery.file_url && (
              <a href={service.delivery.file_url} style={{ fontSize: '.85rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <FiDownload size={12} /> Download file
              </a>
            )}
          </div>
        </div>
      )}

      {stillWaiting && (sellerEmail || wa) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {sellerEmail && (
            <a
              href={`mailto:${sellerEmail}?subject=${encodeURIComponent(`Order: ${productTitle}`)}`}
              onClick={e => e.stopPropagation()} className="btn btn--ghost btn--sm"
            >
              <FiMail size={13} /> Email {sellerName || 'seller'}
            </a>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="btn btn--ghost btn--sm">
              <FiMessageCircle size={13} /> WhatsApp
            </a>
          )}
        </div>
      )}

      {stillWaiting && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {service.fulfillment_status === 'delivered' && (
            <button onClick={confirm} disabled={submitting} className="btn btn--gold btn--sm">
              <FiCheck size={13} /> Confirm, all good
            </button>
          )}
          <button onClick={e => { e.stopPropagation(); setDisputing(d => !d); }} className={`btn btn--sm ${isLate ? '' : 'btn--ghost'}`}
            style={isLate ? { background: 'var(--red)', color: 'var(--ink-contrast)' } : undefined}>
            {disputing ? 'Cancel' : 'Report a problem'}
          </button>
        </div>
      )}

      {disputing && (
        <form onSubmit={submitDispute} style={{ marginTop: 10 }}>
          <div className="field" style={{ marginBottom: 8 }}>
            <textarea required value={reason} onChange={e => setReason(e.target.value)}
              placeholder="What went wrong?" style={{ minHeight: 60 }} />
          </div>
          <button className="btn btn--sm" style={{ background: 'var(--red)', color: 'var(--ink-contrast)' }} disabled={submitting} type="submit">
            Submit report
          </button>
        </form>
      )}

      {service.fulfillment_status === 'released' && (
        <p className="muted" style={{ fontSize: '.82rem', marginTop: 8 }}>Confirmed. Released to the seller.</p>
      )}

      {service.fulfillment_status === 'disputed' && (
        <p style={{ fontSize: '.85rem', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--red)', marginTop: 10 }}>
          <FiAlertTriangle size={13} /> Reported. This is being reviewed and your payment is held until it's resolved.
        </p>
      )}

      {service.fulfillment_status === 'refunded' && (
        <p className="muted" style={{ fontSize: '.85rem' }}>Refunded.</p>
      )}

      {actionError && <p className="error-text" style={{ marginTop: 8 }}>{actionError}</p>}
    </div>
  );
}

function OrderRow({ purchase, onResend }) {
  const navigate = useNavigate();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState(null);
  const [watching, setWatching] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const productUrl = `/@${purchase.creator_handle}/${purchase.product_slug}`;

  async function copyKey(e) {
    e.stopPropagation();
    await navigator.clipboard.writeText(purchase.license_key);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 1800);
  }

  async function resend(e) {
    e.stopPropagation();
    setResending(true);
    setResendError(null);
    try {
      await onResend(purchase.id);
      setResent(true);
      setTimeout(() => setResent(false), 2500);
    } catch (err) {
      setResendError(err.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="card card--pad">
      <div
        role="link"
        tabIndex={0}
        onClick={() => navigate(productUrl)}
        onKeyDown={e => { if (e.key === 'Enter') navigate(productUrl); }}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 8, flexShrink: 0,
            background: purchase.product_cover_path ? `url(${purchase.product_cover_path}) center/cover` : 'var(--green-tint)'
          }} />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{purchase.product_title}</p>
            <p className="muted" style={{ fontSize: '.85rem' }}>{purchase.creator_name} &middot; {formatDate(purchase.created_at)}</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {(purchase.is_video || purchase.is_audio) && (
            <button onClick={e => { e.stopPropagation(); setWatching(w => !w); }} className="btn btn--gold btn--sm">
              {watching ? <FiX size={14} /> : <FiPlay size={14} />}
              {watching ? 'Close' : purchase.is_video ? 'Watch' : 'Play'}
            </button>
          )}
          {purchase.download_url && (
            <>
              <a href={purchase.download_url} onClick={e => e.stopPropagation()} className="btn btn--ghost btn--sm">
                <FiDownload size={14} /> Download
              </a>
              <button onClick={resend} disabled={resending} className="btn btn--ghost btn--sm" title="Resend the link by email">
                <FiRefreshCw size={14} /> {resent ? 'Sent' : 'Resend'}
              </button>
            </>
          )}
          <div style={{ textAlign: 'right' }}>
            <p className="mono" style={{ fontWeight: 600 }}>{formatMoney(purchase.amount_minor, purchase.currency)}</p>
            {purchase.service ? (
              <span className={`badge ${FULFILLMENT_LABEL[purchase.service.fulfillment_status]?.className || 'badge--neutral'}`}>
                {FULFILLMENT_LABEL[purchase.service.fulfillment_status]?.text || purchase.service.fulfillment_status}
              </span>
            ) : (
              <span className={`badge ${purchase.payment_status === 'paid' ? 'badge--green' : 'badge--neutral'}`}>{purchase.payment_status}</span>
            )}
          </div>
        </div>
      </div>

      {watching && purchase.is_video && (
        <video src={purchase.view_url} controls autoPlay style={{ width: '100%', borderRadius: 'var(--radius-sm)', marginTop: 16, background: '#000' }} />
      )}
      {watching && purchase.is_audio && (
        <audio src={purchase.view_url} controls autoPlay style={{ width: '100%', marginTop: 16 }} />
      )}
      {purchase.license_key && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          marginTop: 14, padding: '9px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--field-bg)'
        }}>
          <span className="mono" style={{ fontSize: '.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FiKey size={13} color="var(--gold)" /> {purchase.license_key}
          </span>
          <button onClick={copyKey} className="btn btn--ghost btn--sm" style={keyCopied ? { color: 'var(--green-glow)' } : undefined}>
            {keyCopied ? <FiCheck size={13} /> : <FiCopy size={13} />} {keyCopied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      {purchase.service && (
        <ServiceStatus
          purchaseId={purchase.id} service={purchase.service}
          sellerName={purchase.creator_name} sellerEmail={purchase.creator_email} sellerPhone={purchase.creator_phone}
          productTitle={purchase.product_title}
        />
      )}
      {/* Service orders already have their own dispute flow above (held
          payment, refund/release resolution), this is the equivalent for
          every other order type, which never had any way to flag a
          problem at all. */}
      {!purchase.service && purchase.payment_status === 'paid' && (
        <div style={{ marginTop: 12 }} onClick={e => e.stopPropagation()}>
          <ReportProblem purchaseId={purchase.id} hasOpenReport={purchase.has_open_report} />
        </div>
      )}
      {resendError && <p className="error-text" style={{ marginTop: 10 }}>{resendError}</p>}
    </div>
  );
}

export default function Account() {
  const { user, creator, refresh } = useAuth();
  const [purchases, setPurchases] = useState(null);
  const [error, setError] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState(null);

  useEffect(() => {
    api.get('/api/purchases/mine').then(setPurchases).catch(err => setError(err.message));
  }, []);

  async function resend(purchaseId) {
    await api.post(`/api/purchases/${purchaseId}/resend-download`);
  }

  async function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const body = new FormData();
      body.append('avatar', file);
      await api.patch('/api/auth/me', body);
      await refresh();
    } catch (err) {
      setAvatarError(err.message);
    } finally {
      setUploadingAvatar(false);
    }
  }

  const paidPurchases = purchases?.filter(p => p.payment_status === 'paid') || [];
  const totalSpent = paidPurchases.reduce((sum, p) => sum + p.amount_minor, 0);
  const inProgress = paidPurchases.filter(p => p.service && !['released', 'refunded'].includes(p.service.fulfillment_status));
  const needsAttention = inProgress.filter(p =>
    p.service.fulfillment_status === 'delivered' ||
    (p.service.expected_by && new Date(p.service.expected_by) < new Date())
  );
  const rest = purchases?.filter(p => !needsAttention.includes(p)) || [];

  return (
    <div className="wrap" style={{ padding: '40px 20px 80px', maxWidth: 760 }}>
      {avatarError && <p className="error-text" style={{ marginBottom: 12 }}>{avatarError}</p>}
      <div className="card card--pad" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <label htmlFor="avatar-upload" style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
          <input id="avatar-upload" type="file" accept="image/*" onChange={handleAvatarChange}
            style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0 }} />
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: user?.avatar_url ? `url(${user.avatar_url}) center/cover` : 'var(--green-tint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green-glow)',
            opacity: uploadingAvatar ? .5 : 1
          }}>
            {!user?.avatar_url && <FiUser size={26} />}
          </div>
          <div style={{
            position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: '50%',
            background: 'var(--gold)', color: 'var(--green-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--surface)'
          }}>
            <FiCamera size={11} />
          </div>
        </label>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: '1.15rem' }}>{user?.name || `@${user?.username}`}</p>
          <span className="badge badge--neutral">Buyer</span>
        </div>
      </div>

      {purchases && (
        <div className="stat-grid">
          <div className="card stat-tile">
            <span className="stat-tile__label"><FiPackage size={13} /> Orders</span>
            <span className="stat-tile__value">{paidPurchases.length}</span>
          </div>
          <div className="card stat-tile">
            <span className="stat-tile__label"><FiDollarSign size={13} /> Spent</span>
            <span className="mono stat-tile__value">{formatMoney(totalSpent, 'USD')}</span>
          </div>
          <div className="card stat-tile">
            <span className="stat-tile__label"><FiClock size={13} /> In progress</span>
            <span className="stat-tile__value">{inProgress.length}</span>
          </div>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
      {!purchases && !error && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <div className="skeleton" style={{ height: 72, borderRadius: 'var(--radius)' }} />
          <div className="skeleton" style={{ height: 72, borderRadius: 'var(--radius)' }} />
        </div>
      )}
      {purchases && purchases.length === 0 && (
        <div className="empty-state">
          <FiCompass size={26} color="var(--muted)" style={{ marginBottom: 10 }} />
          <strong>No purchases yet.</strong>
          <Link to="/discover" style={{ color: 'var(--green)', fontWeight: 600 }}>Browse the marketplace</Link>
        </div>
      )}

      {needsAttention.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: '1.05rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)' }}>
            <FiAlertTriangle size={16} /> Needs your attention
          </h2>
          <p className="muted" style={{ fontSize: '.85rem', marginBottom: 14 }}>
            A seller delivered and is waiting on your OK, or an order is running past when it was promised.
          </p>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {needsAttention.map(p => <OrderRow key={p.id} purchase={p} onResend={resend} />)}
          </div>
        </div>
      )}

      {purchases && purchases.length > 0 && (
        <>
          <h2 style={{ fontSize: '1.1rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FiPackage size={17} /> Your library
          </h2>
          <p className="muted" style={{ fontSize: '.85rem', marginBottom: 16 }}>
            Everything you've bought stays here: downloads, license keys, and services you're waiting on.
          </p>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {rest.map(p => <OrderRow key={p.id} purchase={p} onResend={resend} />)}
          </div>
        </>
      )}

      <div style={{ marginTop: 28 }}>
        <ThemeToggle />
      </div>

      {!creator && (
        <p className="muted" style={{ fontSize: '.82rem', marginTop: 20, textAlign: 'center' }}>
          Also selling something? <Link to="/onboarding" style={{ color: 'var(--green)', fontWeight: 600 }}>Start a storefront</Link>
        </p>
      )}
    </div>
  );
}
