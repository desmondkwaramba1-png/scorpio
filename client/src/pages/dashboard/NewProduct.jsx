import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiImage, FiDollarSign, FiPackage, FiBriefcase, FiFilePlus, FiCheckCircle, FiSend, FiCopy, FiExternalLink, FiArrowRight } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/money';
import FileUpload from '../../components/FileUpload.jsx';
import UploadProgress from '../../components/UploadProgress.jsx';
import useLeaveGuard from '../../lib/useLeaveGuard.js';
import FormSection from '../../components/FormSection.jsx';
import Seal from '../../components/Seal.jsx';
import { ACTIVE_CATEGORIES, EBOOKS_ONLY } from '../../lib/launchScope.js';

export default function NewProduct() {
  const { creator } = useAuth();
  const navigate = useNavigate();
  const lockedCategory = ACTIVE_CATEGORIES.length === 1 ? ACTIVE_CATEGORIES[0].value : '';
  const [form, setForm] = useState({
    title: '', description: '', type: 'single', category: lockedCategory, price: '', currency: 'USD',
    quantity_limit: '', license_keys: '', portfolio_url: '', delivery_days: '', service_terms: ''
  });
  const [cover, setCover] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [previewVideo, setPreviewVideo] = useState(null);
  const [previewVideoName, setPreviewVideoName] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [canRetry, setCanRetry] = useState(false);
  const [publishedProduct, setPublishedProduct] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const submitLock = useRef(false);
  const publishRequest = useRef(null);
  useLeaveGuard(submitting);

  const update = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    publishRequest.current = null;
    setForm(f => ({ ...f, [key]: value }));
  };

  function handleCover(e) {
    const f = e.target.files[0];
    publishRequest.current = null;
    setCover(f);
    setCoverPreview(f ? URL.createObjectURL(f) : null);
  }

  function handleFile(e) {
    const f = e.target.files[0];
    publishRequest.current = null;
    setFile(f);
    setFilePreview(f ? f.name : null);
  }

  function handlePreviewVideo(e) {
    const f = e.target.files[0];
    publishRequest.current = null;
    setPreviewVideo(f);
    setPreviewVideoName(f ? f.name : null);
  }

  const isService = form.type === 'service';
  const isSerial = form.type === 'serial';
  const isSubscription = form.type === 'subscription';
  const hasIssues = isSerial || isSubscription;
  const isSoftware = form.category === 'software';
  const isCourse = form.category === 'courses';
  const hasDeliverable = isService || hasIssues || !!file || form.license_keys.trim().length > 0;
  const detailsReady = !!form.title.trim() && !!form.category &&
    form.price !== '' && Number.isFinite(Number(form.price)) && Number(form.price) >= 0;
  const publishReady = detailsReady && hasDeliverable && !!cover;

  function showValidationError(message, fieldId) {
    setError(message);
    if (fieldId) {
      requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
    }
  }

  async function submit(status) {
    if (submitLock.current) return;
    setError(null);
    setCanRetry(false);
    if (!form.title.trim()) {
      showValidationError('Add a clear product title before continuing.', 'title');
      return;
    }
    if (!form.category) {
      showValidationError('Choose a category so buyers can find your product.', 'category');
      return;
    }
    const numericPrice = Number(form.price);
    if (form.price === '' || !Number.isFinite(numericPrice) || numericPrice < 0) {
      showValidationError('Enter a valid price of zero or more.', 'price');
      return;
    }
    if (!cover) {
      showValidationError("Add a cover image. It's the first thing buyers see.", 'cover');
      return;
    }
    // A serial's (and a subscription's) content is its issues, added
    // after the listing exists (see EditProduct.jsx), there's nothing to
    // attach at creation time, same as a service having nothing to hand
    // over until the work's done.
    if (!isService && !hasIssues) {
      const hasKeys = form.license_keys.trim().length > 0;
      if (status === 'published' && !file && !hasKeys) {
        showValidationError('Add the file or license keys buyers will receive before publishing.', isSoftware ? 'license_keys' : 'file');
        return;
      }
    }
    submitLock.current = true;
    setSubmitting(true);
    setUploadProgress(0);
    const body = new FormData();
    Object.entries(form).forEach(([k, v]) => body.append(k, v));
    body.append('status', status);
    body.append('cover', cover);
    if (file) body.append('file', file);
    if (previewVideo) body.append('preview_video', previewVideo);
    if (!publishRequest.current || publishRequest.current.status !== status) {
      publishRequest.current = { key: crypto.randomUUID(), status };
    }

    try {
      // A course video (or even just a real PDF) can be a genuinely large
      // upload — the server side of publishing is already fast (confirmed
      // directly: single-digit milliseconds), the actual file leaving a
      // real connection is what can take real time. Real progress here
      // (see lib/api.js's uploadWithProgress) is what turns that wait from
      // "is this broken?" into something visibly, honestly working.
      const requestKey = publishRequest.current.key;
      const directUpload = ['scorpio.co.zw', 'www.scorpio.co.zw'].includes(window.location.hostname);
      const prepareAttempt = async () => {
        const requestId = crypto.randomUUID();
        const headers = { 'Idempotency-Key': requestKey, 'X-Request-ID': requestId };
        if (!directUpload) return { path: '/api/products', headers, crossOrigin: false };
        let authorization;
        try {
          authorization = await api.post(
            '/api/products/upload-token',
            { request_key: requestKey },
            undefined,
            { 'X-Request-ID': requestId }
          );
        } catch (error) {
          error.requestId = requestId;
          if (!error.status || [502, 503, 504].includes(error.status)) error.retryable = true;
          throw error;
        }
        headers['X-Product-Upload-Token'] = authorization.token;
        return { path: authorization.upload_url, headers, crossOrigin: true };
      };
      const data = await api.uploadWithProgress('/api/products', 'POST', body, setUploadProgress, 180000, {
        'Idempotency-Key': requestKey
      }, {
        prepareAttempt
      });
      publishRequest.current = null;
      if (status === 'published') setPublishedProduct(data);
      else navigate('/dashboard/products');
    } catch (err) {
      setError(err.requestId ? `${err.message} (Reference: ${err.requestId})` : err.message);
      setCanRetry(!err.status || err.retryable || err.status >= 500);
    } finally {
      submitLock.current = false;
      setSubmitting(false);
      setUploadProgress(0);
    }
  }

  const price = form.price === '' ? null
    : parseFloat(form.price) === 0 ? 'Free'
    : formatMoney(Math.round(parseFloat(form.price || '0') * 100), form.currency);

  async function copyProductLink() {
    const productUrl = `${window.location.origin}/@${creator.handle}/${publishedProduct.slug}`;
    await navigator.clipboard.writeText(productUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  if (publishedProduct) {
    const productUrl = `/@${creator.handle}/${publishedProduct.slug}`;
    return (
      <section className="publish-success" aria-labelledby="publish-success-title">
        <div className="publish-success__mark"><FiCheckCircle size={30} /></div>
        <p className="section__eyebrow mono">YOUR PRODUCT IS LIVE</p>
        <h1 id="publish-success-title">You just put your work out there.</h1>
        <p className="publish-success__intro">{publishedProduct.title} is now published on your storefront. Share it with the people who need it.</p>

        <div className="publish-success__preview">
          <div className="publish-success__cover" style={coverPreview ? { backgroundImage: `url(${coverPreview})` } : undefined}>
            {!coverPreview && form.title.charAt(0).toUpperCase()}
          </div>
          <div className="publish-success__details">
            <span className="badge badge--green">Published</span>
            <h2>{publishedProduct.title}</h2>
            <p>{price || 'Free'} <span>on your storefront</span></p>
          </div>
        </div>

        <div className="publish-success__actions">
          <Link to={productUrl} className="btn btn--primary"><FiExternalLink size={15} /> View live listing</Link>
          <button type="button" className="btn btn--ghost" onClick={copyProductLink}>
            {linkCopied ? <FiCheckCircle size={15} /> : <FiCopy size={15} />}
            {linkCopied ? 'Link copied' : 'Copy product link'}
          </button>
        </div>
        <div className="publish-success__next">
          <Link to={`/dashboard/products/${publishedProduct.id}/edit`}>Manage listing <FiArrowRight size={14} /></Link>
          <Link to="/dashboard/products/new">Publish another product <FiArrowRight size={14} /></Link>
          <Link to="/dashboard">Back to dashboard <FiArrowRight size={14} /></Link>
        </div>
      </section>
    );
  }

  return (
    <div className="new-product-page">
      <div className="product-editor-intro">
        <div>
          <p className="section__eyebrow mono">YOUR NEXT BIG IDEA</p>
          <h1 style={{ fontSize: '1.65rem', marginBottom: 6 }}>Add a product</h1>
          <p className="muted">Add the essentials, preview your listing, and publish when it’s ready.</p>
        </div>
        <div className="publish-steps" aria-label="Product publishing steps">
          <span className={`publish-step${detailsReady ? ' publish-step--complete' : ' publish-step--active'}`}><b>{detailsReady ? <FiCheckCircle size={12} /> : '1'}</b> Details</span>
          <span className="publish-step__line" />
          <span className={`publish-step${detailsReady && hasDeliverable ? ' publish-step--complete' : detailsReady ? ' publish-step--active' : ''}`}><b>{detailsReady && hasDeliverable ? <FiCheckCircle size={12} /> : '2'}</b> Buyer value</span>
          <span className="publish-step__line" />
          <span className={`publish-step${publishReady ? ' publish-step--active' : ''}`}><b>3</b> Publish</span>
        </div>
      </div>

      <div className="form-layout">
        <form className="new-product-form" noValidate onSubmit={e => { e.preventDefault(); submit('published'); }}>
          <FormSection icon={FiImage} title="Product details" note="Start with the information buyers use to recognize and find your work.">
            <div className="field">
              <label htmlFor="title">Product title <span className="new-product-required">Required</span></label>
              <input id="title" autoFocus required value={form.title} onChange={update('title')} placeholder={EBOOKS_ONLY ? 'e.g. 30-Day Business Plan Template' : 'e.g. Excel for Small Business'} />
            </div>

            <div className="field">
              <label htmlFor="description">Description <span className="new-product-optional">Optional</span></label>
              <textarea id="description" value={form.description} onChange={update('description')}
                placeholder="What does it help with? What will buyers get or learn?" />
              <small>A short, specific description helps buyers decide faster. You can improve it later.</small>
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="category">Category <span className="new-product-required">Required</span></label>
              {ACTIVE_CATEGORIES.length === 1 ? (
                <>
                  <input id="category" value={ACTIVE_CATEGORIES[0].label} disabled />
                  <small>Your product will be listed in this category.</small>
                </>
              ) : (
                <select id="category" required value={form.category} onChange={update('category')}>
                  <option value="" disabled>Choose a category</option>
                  {ACTIVE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              )}
              {ACTIVE_CATEGORIES.length > 1 && <small>This is how buyers find it when browsing. Pick the closest fit.</small>}
            </div>
          </FormSection>

          <FormSection icon={FiDollarSign} title="Choose how to sell" note="Pick the product type and set a clear price. You can change these later.">
            <div className="field">
              <label htmlFor="type">Product type</label>
              <select id="type" value={form.type} onChange={update('type')}>
                <option value="single">One-time purchase</option>
                <option value="serial">Series — pay once, get every issue</option>
                <option value="subscription">Subscription — recurring monthly access</option>
                {!EBOOKS_ONLY && <option value="service">Service (bespoke work, paid via escrow)</option>}
              </select>
              {isService && (
                <small>
                  No file to attach. Buyers pay based on your portfolio, the payment is held safely,
                  and you deliver the actual work per order once they've paid.
                </small>
              )}
              {isSubscription && (
                <small>
                  Buyers pay every month instead of once, and keep getting new issues only while they stay
                  subscribed. EcoCash can't auto-charge, so each renewal is one tap from them, we remind them first.
                </small>
              )}
            </div>

            <div className="new-product-price-row">
              <div className="field">
                <label htmlFor="price">{isSubscription ? 'Monthly price' : 'Price'} <span className="new-product-required">Required</span></label>
                <div className="new-product-price-input">
                  <span aria-hidden="true">{form.currency === 'USD' ? '$' : 'ZiG'}</span>
                  <input id="price" type="number" min="0" step="0.01" required inputMode="decimal"
                    value={form.price} onChange={update('price')} placeholder="0.00" />
                </div>
                <small>{isSubscription
                  ? 'Billed every 30 days. Set to 0 for free access.'
                  : 'Set to 0 for a free product. Buyers get free products immediately.'}</small>
              </div>
              <div className="field">
                <label htmlFor="currency">Currency</label>
                <select id="currency" value={form.currency} onChange={update('currency')}>
                  <option value="USD">USD ($)</option>
                  <option value="ZWG">ZiG</option>
                </select>
              </div>
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="quantity_limit">{isService ? 'Order limit (optional)' : 'Limited quantity (optional)'}</label>
              <input id="quantity_limit" type="number" min="1" value={form.quantity_limit} onChange={update('quantity_limit')}
                placeholder="Leave blank for unlimited" />
              {isService && <small>Cap how many of these you'll take on at once. Good for bespoke work with real turnaround time.</small>}
            </div>
          </FormSection>

          <FormSection icon={isService ? FiBriefcase : hasIssues ? FiFilePlus : FiPackage} title={isService ? 'Service details' : hasIssues ? 'Issues' : 'What buyers get'}>
            <div className="field">
              <label htmlFor="cover">Cover image <span className="new-product-required">Required</span></label>
              <FileUpload id="cover" accept="image/*" onChange={handleCover}
                label={cover ? 'Change cover image' : 'Choose a cover image'}
                hint="Choose a clear image that looks good in a marketplace card. We’ll crop it to fit."
                preview={coverPreview} previewKind="image" crop={{ aspect: 5 / 4 }} maxBytes={30 * 1024 * 1024} />
            </div>
            {isService ? (
              <>
                <div className="field">
                  <label htmlFor="portfolio_url">Portfolio links</label>
                  <textarea id="portfolio_url" value={form.portfolio_url} onChange={update('portfolio_url')}
                    placeholder={'One per line, e.g.\nhttps://behance.net/you\nhttps://drive.google.com/your-past-work'}
                    style={{ minHeight: 80 }} />
                  <small>This is what buyers trust instead of a fixed product, so make it count. Add a few examples, not just one.</small>
                </div>
                <div className="field">
                  <label htmlFor="delivery_days">Typical delivery time (days)</label>
                  <input id="delivery_days" type="number" min="1" value={form.delivery_days} onChange={update('delivery_days')} placeholder="3" />
                  <small>Shown to buyers, and used to tell them when they're entitled to report a late order.</small>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="service_terms">What's included &amp; terms</label>
                  <textarea id="service_terms" value={form.service_terms} onChange={update('service_terms')}
                    placeholder={'e.g.\n- 2 rounds of revisions included\n- You\'ll need to send your brand colors and any reference images upfront\n- No refunds once work has started, only for non-delivery'}
                    style={{ minHeight: 110 }} />
                  <small>Revisions, what you need from the buyer, cancellation policy. Set expectations before they pay, not after.</small>
                </div>
              </>
            ) : isSerial ? (
              <p className="muted" style={{ fontSize: '.9rem', lineHeight: 1.6 }}>
                Publish the listing first, then add Issue 1 (and every issue after it) from its Edit page.
                Anyone who buys gets every issue you publish under this product from then on, that's the whole
                point of a serial: pay once, chapters keep arriving.
              </p>
            ) : isSubscription ? (
              <p className="muted" style={{ fontSize: '.9rem', lineHeight: 1.6 }}>
                Publish the listing first, then add Issue 1 (and every issue after it) from its Edit page,
                same as a serial. The real difference is access: a subscriber only gets new issues while
                they're actually subscribed, someone who lapses stops receiving them until they renew,
                unlike a serial's one-time "pay once, own it forever."
              </p>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="file">{isCourse ? 'Course video' : EBOOKS_ONLY ? 'PDF file' : 'Product file'} <span className={isSoftware ? 'new-product-optional' : 'new-product-required'}>{isSoftware ? 'Optional if using license keys' : 'Required to publish'}</span></label>
                  <FileUpload id="file" accept={isCourse ? 'video/mp4,video/webm,video/quicktime' : EBOOKS_ONLY ? 'application/pdf' : undefined} onChange={handleFile} maxBytes={500 * 1024 * 1024}
                    label={filePreview || (isCourse ? 'Choose a video' : EBOOKS_ONLY ? 'Choose a PDF' : 'Choose a file')}
                    hint={isSoftware ? 'Required to publish, unless you paste license keys below instead.' : 'Required to publish. It\'s what the buyer actually gets.'} />
                </div>

                {isCourse && (
                  <div className="field">
                    <label htmlFor="preview_video">Free preview clip (optional)</label>
                    <FileUpload id="preview_video" accept="video/mp4,video/webm,video/quicktime" onChange={handlePreviewVideo} maxBytes={500 * 1024 * 1024}
                      label={previewVideoName || 'Choose a short clip'}
                      hint="A short, real sample anyone can watch free, no purchase needed. This is what actually earns a buyer's trust on a course they've never seen, not the full paid video with playback cut off." />
                  </div>
                )}

                {isSoftware && (
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor="license_keys">License keys (optional)</label>
                    <textarea id="license_keys" value={form.license_keys} onChange={update('license_keys')}
                      placeholder={'One key per line, e.g.\nABCD-1234-EFGH-5678\nWXYZ-9876-IJKL-4321'} style={{ minHeight: 110 }} />
                    <small>
                      Each sale claims one unused key from this list. "Left in stock" becomes however many you paste
                      here, whatever you set above. You can add more later.
                    </small>
                  </div>
                )}
              </>
            )}
          </FormSection>

          {error && (
            <div role="alert" aria-live="assertive" style={{ marginTop: 20 }}>
              <p className="error-text" style={{ marginTop: 0 }}>{error}</p>
              {canRetry && <p className="upload-retry">Nothing was lost. Your details and files are still here. Tap Publish again to retry; it will not create a duplicate listing.</p>}
            </div>
          )}

          {submitting && <UploadProgress progress={uploadProgress} label={file || cover ? 'Uploading your files' : 'Publishing'} />}

          <div className="new-product-actions">
            <button className="btn btn--ghost" disabled={submitting} type="button" onClick={() => submit('draft')}>
              {submitting ? 'Please wait...' : 'Save draft'}
            </button>
            <button className="btn btn--primary" style={{ flex: 1 }} disabled={submitting} type="submit">
              <FiSend size={14} /> {submitting ? 'Publishing...' : 'Publish product'}
            </button>
          </div>
        </form>

        <div className="form-layout__preview">
          <div className="preview-heading">
            <div><p className="preview-heading__eyebrow mono">BUYER PREVIEW</p><p className="preview-heading__title">What people will see</p></div>
            <span className="preview-heading__badge">Preview</span>
          </div>
          <div className="product-card" style={{ cursor: 'default' }}>
            <div
              className={`product-card__cover${coverPreview ? '' : ' product-card__cover--empty'}`}
              style={coverPreview ? { backgroundImage: `url(${coverPreview})` } : undefined}
            >
              {!coverPreview && (form.title ? form.title.charAt(0).toUpperCase() : '?')}
              {creator?.avatar_path && (
                <div className="product-card__watermark" style={{ backgroundImage: `url(${creator.avatar_path})` }} />
              )}
            </div>
            <div className="product-card__body">
              <p className="product-card__title">{form.title || 'Your product title'}</p>
              <div className="product-card__meta">
                <span className="product-card__creator">{creator?.name}</span>
                {!!creator?.verified && <Seal />}
              </div>
              <p className="mono product-card__price">{price || 'Set a price'}</p>
            </div>
          </div>
          <div className="publish-readiness">
            <p className="publish-readiness__title">Ready to publish when:</p>
              <p className={`publish-readiness__item${cover ? ' is-ready' : ''}`}><FiCheckCircle size={14} /> Cover image added</p>
              <p className={`publish-readiness__item${form.title.trim() && form.category ? ' is-ready' : ''}`}><FiCheckCircle size={14} /> Title and category chosen</p>
            <p className={`publish-readiness__item${price !== null ? ' is-ready' : ''}`}><FiCheckCircle size={14} /> Price set</p>
            <p className={`publish-readiness__item${hasDeliverable ? ' is-ready' : ''}`}><FiCheckCircle size={14} /> Buyer deliverable ready</p>
              <p className="publish-readiness__note">{publishReady ? 'You’re ready to publish.' : 'Your checklist updates as you build your listing.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
