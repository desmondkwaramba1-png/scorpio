import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { FiTrash2, FiAlertTriangle, FiExternalLink, FiTag, FiKey, FiImage, FiBriefcase, FiPackage, FiFilePlus, FiArrowRight, FiCheckCircle, FiSend, FiEyeOff } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/money';
import FileUpload from '../../components/FileUpload.jsx';
import FormSection from '../../components/FormSection.jsx';
import Seal from '../../components/Seal.jsx';
import { CATEGORIES } from '../../lib/categories.js';
import { ACTIVE_CATEGORIES, EBOOKS_ONLY } from '../../lib/launchScope.js';

export default function EditProduct() {
  const { id } = useParams();
  const { creator } = useAuth();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(null);
  const [cover, setCover] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [previewVideo, setPreviewVideo] = useState(null);
  const [previewVideoName, setPreviewVideoName] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [newKeys, setNewKeys] = useState('');
  const [addingKeys, setAddingKeys] = useState(false);
  const [keysError, setKeysError] = useState(null);

  useEffect(() => {
    api.get('/api/products/mine')
      .then(products => {
        const p = products.find(p => String(p.id) === id);
        if (!p) { setLoadError('Product not found.'); return; }
        setProduct(p);
        setForm({
          title: p.title, description: p.description || '', category: p.category || '',
          price: (p.price_minor / 100).toString(),
          currency: p.currency,
          quantity_limit: p.quantity_limit ?? '',
          discount_enabled: !!p.discount_percent,
          discount_percent: p.discount_percent ?? '',
          discount_limit: p.discount_limit ?? '',
          portfolio_url: p.portfolio_url || '', delivery_days: p.delivery_days ?? '',
          service_terms: p.service_terms || ''
        });
        setCoverPreview(p.cover_path);
      })
      .catch(err => setLoadError(err.message));
  }, [id]);

  const update = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [key]: value }));
  };

  function handleCover(e) {
    const f = e.target.files[0];
    setCover(f);
    setCoverPreview(f ? URL.createObjectURL(f) : product.cover_path);
  }

  function handleFile(e) {
    const f = e.target.files[0];
    setFile(f);
    setFilePreview(f ? f.name : null);
  }

  function handlePreviewVideo(e) {
    const f = e.target.files[0];
    setPreviewVideo(f);
    setPreviewVideoName(f ? f.name : null);
  }

  async function submit(status) {
    setError(null);
    if (!form.category) {
      setError('Pick a category. It\'s how buyers find this when browsing.');
      return;
    }
    if (product.type !== 'service') {
      const willHaveFile = file || product.file_kind;
      const willHaveKeys = product.total_keys > 0;
      if (status === 'published' && !willHaveFile && !willHaveKeys) {
        setError('Attach a file, or add license keys, before publishing. Buyers need something to actually receive.');
        return;
      }
    }
    if (form.discount_enabled) {
      const pct = parseInt(form.discount_percent, 10);
      if (!Number.isInteger(pct) || pct < 1 || pct > 90) {
        setError('The promotion discount must be a whole number between 1 and 90.');
        return;
      }
    }
    setSubmitting(true);
    setUploadProgress(0);
    const payload = { ...form };
    if (!payload.discount_enabled) {
      payload.discount_percent = '';
      payload.discount_limit = '';
    }
    delete payload.discount_enabled;

    const body = new FormData();
    Object.entries(payload).forEach(([k, v]) => body.append(k, v));
    body.append('status', status);
    if (cover) body.append('cover', cover);
    if (file) body.append('file', file);
    if (previewVideo) body.append('preview_video', previewVideo);

    try {
      // Same reasoning as NewProduct.jsx: a replaced deliverable (a course
      // video especially) can be a genuinely large upload, real progress
      // is what keeps that from reading as broken.
      await api.uploadWithProgress(`/api/products/${id}`, 'PATCH', body, setUploadProgress, 180000);
      navigate('/dashboard/products');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
    }
  }

  async function addKeys() {
    setKeysError(null);
    if (!newKeys.trim()) return;
    setAddingKeys(true);
    try {
      const stats = await api.post(`/api/products/${id}/license-keys`, { license_keys: newKeys });
      setProduct(p => ({ ...p, total_keys: stats.total, unclaimed_keys: stats.unclaimed }));
      setNewKeys('');
    } catch (err) {
      setKeysError(err.message);
    } finally {
      setAddingKeys(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/api/products/${id}`);
      navigate('/dashboard/products');
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  }

  if (loadError) {
    return <div><p className="error-text">{loadError}</p></div>;
  }
  if (!product || !form) {
    return (
      <div style={{ maxWidth: 480 }}>
        <div className="skeleton" style={{ height: 24, width: '60%', marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 200, borderRadius: 'var(--radius)' }} />
      </div>
    );
  }

  const price = form.price === '' ? null
    : parseFloat(form.price) === 0 ? 'Free'
    : formatMoney(Math.round(parseFloat(form.price || '0') * 100), form.currency);
  const publicUrl = creator ? `/@${creator.handle}/${product.slug}` : null;
  const isCourse = form.category === 'courses';
  // A legacy product from a category we've since paused (e.g. "writing")
  // stays editable in its own category, it just can't be switched to any
  // other paused category, only forward into one of the active ones.
  const categoryOptions = ACTIVE_CATEGORIES.some(c => c.value === product.category)
    ? ACTIVE_CATEGORIES
    : [...ACTIVE_CATEGORIES, ...CATEGORIES.filter(c => c.value === product.category)];
  const hasDeliverable = product.type === 'service' || ['serial', 'subscription'].includes(product.type) || !!file || !!product.file_kind || product.total_keys > 0;

  return (
    <div>
      <div className="product-editor-intro">
        <div>
          <p className="section__eyebrow mono">MANAGE YOUR LISTING</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.5rem' }}>Edit product</h1>
            <span className={`badge ${product.status === 'published' ? 'badge--green' : 'badge--neutral'}`}>{product.status}</span>
          </div>
          <p className="muted" style={{ marginTop: 6 }}>Update the details, check the buyer preview, then save or publish again.</p>
        </div>
        <div className="publish-steps" aria-label="Product publishing steps">
          <span className="publish-step publish-step--active"><b>1</b> Details</span>
          <span className="publish-step__line" />
          <span className="publish-step"><b>2</b> Deliverable</span>
          <span className="publish-step__line" />
          <span className="publish-step"><b>3</b> Publish</span>
        </div>
      </div>
      {publicUrl && (
        <p style={{ marginBottom: 28 }}>
          <Link to={publicUrl} className="muted" style={{ fontSize: '.85rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <FiExternalLink size={13} /> View public listing
          </Link>
        </p>
      )}

      <div className="form-layout">
        <form onSubmit={e => { e.preventDefault(); submit(product.status); }} style={{ maxWidth: 480 }}>
          <FormSection icon={FiImage} title="The basics">
            <div className="field">
              <label htmlFor="cover">Cover image</label>
              <FileUpload id="cover" accept="image/*" onChange={handleCover}
                label={cover ? 'New cover ready' : 'Replace cover image'}
                hint="Leave as-is to keep your current cover. New uploads get their colours auto-tuned."
                preview={coverPreview} previewKind="image" crop={{ aspect: 5 / 4 }} />
            </div>

            <div className="field">
              <label htmlFor="title">Title</label>
              <input id="title" required value={form.title} onChange={update('title')} />
            </div>

            <div className="field">
              <label htmlFor="description">Description</label>
              <textarea id="description" value={form.description} onChange={update('description')} />
            </div>

            <div className="field">
              <label htmlFor="category">Category</label>
              <select id="category" required value={form.category} onChange={update('category')}>
                <option value="" disabled>Choose a category</option>
                {categoryOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Type</label>
              <p className="muted" style={{ fontSize: '.9rem' }}>
                {product.type === 'serial' ? 'Serial (pay once, unlocks every issue)'
                  : product.type === 'subscription' ? 'Subscription (recurring)'
                  : product.type === 'service' ? 'Service (escrow)' : 'Single item'}. Can't be changed after creation.
              </p>
            </div>

            <div className="field" style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="price">Price</label>
                <input id="price" type="number" min="0" step="0.01" required
                  value={form.price} onChange={update('price')} />
                <small>0 makes it free, no EcoCash step, buyers get it instantly.</small>
              </div>
              <div style={{ width: 90 }}>
                <label htmlFor="currency">Currency</label>
                <select id="currency" value={form.currency} onChange={update('currency')}>
                  <option value="USD">USD</option>
                  <option value="ZWG">ZiG</option>
                </select>
              </div>
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="quantity_limit">Limited quantity (optional)</label>
              <input id="quantity_limit" type="number" min="1" value={form.quantity_limit} onChange={update('quantity_limit')}
                placeholder="Leave blank for unlimited" />
            </div>
          </FormSection>

          <FormSection icon={FiTag} title="Promotion">
            <div className="field" style={{ marginBottom: form.discount_enabled ? 16 : 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', fontWeight: 400 }}>
                <input type="checkbox" checked={form.discount_enabled} onChange={update('discount_enabled')}
                  style={{ width: 'auto', marginRight: 8 }} />
                Run a promotion
              </label>
            </div>

            {form.discount_enabled && (
              <>
                <div className="field" style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label htmlFor="discount_percent">Discount</label>
                    <input id="discount_percent" type="number" min="1" max="90" required
                      value={form.discount_percent} onChange={update('discount_percent')} placeholder="20" />
                    <small>% off</small>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label htmlFor="discount_limit">Limit (optional)</label>
                    <input id="discount_limit" type="number" min="1"
                      value={form.discount_limit} onChange={update('discount_limit')} placeholder="Unlimited" />
                    <small>First X buyers</small>
                  </div>
                </div>

                {!!product.discount_percent && (
                  <p className="muted" style={{ fontSize: '.85rem', marginTop: -4 }}>
                    {product.promo_active
                      ? (product.discount_limit
                        ? `Active: ${product.discount_claimed} of ${product.discount_limit} claimed.`
                        : 'Active: no buyer limit.')
                      : `Reached its limit (${product.discount_claimed}/${product.discount_limit} claimed) and stopped applying. Raise the limit above to bring it back, that's the "extend" for this promo.`}
                  </p>
                )}
              </>
            )}
          </FormSection>

          {product.type === 'service' ? (
            <FormSection icon={FiBriefcase} title="Service details">
              <div className="field">
                <label htmlFor="portfolio_url">Portfolio links</label>
                <textarea id="portfolio_url" value={form.portfolio_url} onChange={update('portfolio_url')}
                  placeholder={'One per line, e.g.\nhttps://behance.net/you\nhttps://drive.google.com/your-past-work'}
                  style={{ minHeight: 80 }} />
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
            </FormSection>
          ) : ['serial', 'subscription'].includes(product.type) ? (
            <FormSection icon={FiFilePlus} title="Issues">
              <p className="muted" style={{ fontSize: '.9rem', marginBottom: 14 }}>
                {product.type === 'subscription'
                  ? "Publishing a new issue is a separate step from these settings, since it goes straight out to everyone who's currently subscribed."
                  : "Publishing a new issue is a separate step from these settings, since it goes straight out to everyone who's bought this."}
              </p>
              <Link to={`/dashboard/products/${id}/issues`} className="btn btn--primary btn--sm">
                Publish an issue <FiArrowRight size={14} />
              </Link>
            </FormSection>
          ) : (
            <>
              {(form.category === 'software' || product.total_keys > 0) && (
                <FormSection icon={FiKey} title="License keys"
                  note={product.total_keys > 0
                    ? `${product.unclaimed_keys} left of ${product.total_keys} · ${product.total_keys - product.unclaimed_keys} claimed by buyers`
                    : undefined}>
                  <div className="field" style={{ marginBottom: 10 }}>
                    <label htmlFor="new_keys">{product.total_keys > 0 ? 'Add more keys' : 'Paste keys to sell this as software with an activation key'}</label>
                    <textarea id="new_keys" value={newKeys} onChange={e => setNewKeys(e.target.value)}
                      placeholder={'One key per line, e.g.\nABCD-1234-EFGH-5678'} style={{ minHeight: 90 }} />
                    <small>Tops up stock. Never touches keys already claimed by past buyers.</small>
                  </div>
                  {keysError && <p className="error-text" style={{ marginBottom: 10 }}>{keysError}</p>}
                  <button type="button" className="btn btn--ghost btn--sm" disabled={addingKeys || !newKeys.trim()} onClick={addKeys}>
                    {addingKeys ? 'Adding...' : 'Add keys'}
                  </button>
                </FormSection>
              )}

              <FormSection icon={FiPackage} title="What buyers get">
                <div className="field" style={{ marginBottom: isCourse ? undefined : 0 }}>
                  <label htmlFor="file">{isCourse ? 'Course video' : EBOOKS_ONLY ? 'PDF file' : 'Product file'}</label>
                  <FileUpload id="file" accept={isCourse ? 'video/mp4,video/webm,video/quicktime' : EBOOKS_ONLY ? 'application/pdf' : undefined} onChange={handleFile}
                    label={filePreview || 'Replace file'}
                    hint={
                      product.file_kind === 'upload' ? `Current file: ${product.file_name}. Choose a new one to replace it.`
                        : product.file_kind === 'external_link' ? `Currently delivered via an external link. Choose a file to replace it.`
                          : product.total_keys > 0 ? 'No file attached. Delivery is by license key only, which is fine.'
                            : 'No file attached yet.'
                    } />
                </div>

                {isCourse && (
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor="preview_video">Free preview clip (optional)</label>
                    <FileUpload id="preview_video" accept="video/mp4,video/webm,video/quicktime" onChange={handlePreviewVideo}
                      label={previewVideoName || (product.preview_video_path ? 'Replace preview clip' : 'Choose a short clip')}
                      hint="A short, real sample anyone can watch free, no purchase needed." />
                  </div>
                )}
              </FormSection>
            </>
          )}

          {error && <p className="error-text" style={{ marginTop: 20 }}>{error}</p>}

          {submitting && (
            <div style={{ marginTop: 20 }}>
              <div className="upload-progress"><div className="upload-progress__bar" style={{ width: `${uploadProgress}%` }} /></div>
              <p className="muted" style={{ fontSize: '.8rem', marginTop: 6, textAlign: 'center' }}>
                {uploadProgress < 100 ? `Uploading ${uploadProgress}%${uploadProgress < 20 ? ', this can take a moment for a bigger file' : ''}` : 'Almost done...'}
              </p>
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 20 }}>
            <button
              className="btn btn--ghost" disabled={submitting} type="button"
              onClick={() => submit(product.status === 'published' ? 'draft' : 'published')}
            >
              {product.status === 'published' ? <FiEyeOff size={14} /> : <FiSend size={14} />}
              {product.status === 'published' ? 'Unpublish' : 'Publish'}
            </button>
            <button className="btn btn--primary" style={{ flex: 1 }} disabled={submitting} type="submit">
              {submitting ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>

        <div className="form-layout__preview">
          <div className="preview-heading">
            <div><p className="preview-heading__eyebrow mono">BUYER PREVIEW</p><p className="preview-heading__title">What people will see</p></div>
            <span className="preview-heading__badge">Live</span>
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
            <p className={`publish-readiness__item${product.cover_path || cover ? ' is-ready' : ''}`}><FiCheckCircle size={14} /> Cover image added</p>
            <p className={`publish-readiness__item${form.title && form.category ? ' is-ready' : ''}`}><FiCheckCircle size={14} /> Title and category chosen</p>
            <p className={`publish-readiness__item${price !== null ? ' is-ready' : ''}`}><FiCheckCircle size={14} /> Price set</p>
            <p className={`publish-readiness__item${hasDeliverable ? ' is-ready' : ''}`}><FiCheckCircle size={14} /> Buyer deliverable ready</p>
          </div>

          <div className="card card--pad" style={{ marginTop: 20 }}>
            <p style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--red)' }}>
              <FiAlertTriangle size={15} /> Delete this product
            </p>
            {product.has_purchases ? (
              <p className="muted" style={{ fontSize: '.85rem' }}>
                This product has orders against it, so it can't be deleted. That would break buyers' access to what they already bought.
                Unpublish it instead if you want it off the marketplace.
              </p>
            ) : (
              <>
                <p className="muted" style={{ fontSize: '.85rem', marginBottom: 12 }}>
                  This product has never been bought, so it's safe to remove permanently. This can't be undone.
                </p>
                {deleteError && <p className="error-text" style={{ marginBottom: 10 }}>{deleteError}</p>}
                {!confirmingDelete ? (
                  <button className="btn btn--ghost btn--sm" onClick={() => setConfirmingDelete(true)}>
                    <FiTrash2 size={14} /> Delete product
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn--ghost btn--sm" onClick={() => setConfirmingDelete(false)}>Cancel</button>
                    <button className="btn btn--sm" style={{ background: 'var(--red)', color: 'var(--ink-contrast)' }} disabled={deleting} onClick={handleDelete}>
                      {deleting ? 'Deleting...' : 'Yes, delete permanently'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
