import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { FiArrowLeft, FiAlertTriangle } from 'react-icons/fi';
import { api } from '../../lib/api';
import { renderMarkdown } from '../../lib/markdown';
import FileUpload from '../../components/FileUpload.jsx';

const EMPTY_FORM = { title: '', excerpt: '', body_markdown: '', featured_product_id: '' };

const NOTICE_TEXT = {
  draft: 'Saved as a draft. Only you can see it.',
  pending_review: 'Submitted — SCORPIO will review it shortly. You\'ll see it here once it\'s approved or if changes are needed.'
};

export default function DashboardBlogEditor() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState(EMPTY_FORM);
  const [cover, setCover] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [existingCoverPath, setExistingCoverPath] = useState(null);
  const [status, setStatus] = useState(null);
  const [rejectionNote, setRejectionNote] = useState(null);
  const [products, setProducts] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // navigate() after a save always carries a fresh state object, even
  // landing on the same URL a second save already sits on — without this,
  // hitting Submit just silently sat on the same form with nothing telling
  // you it actually went anywhere, easy to read as "did that even work."
  useEffect(() => {
    if (!location.state?.justSaved) return;
    setNotice(location.state.justSaved);
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [location.state]);

  // Only published products make sense to feature — a draft has no public
  // page yet for the callout link to point to.
  useEffect(() => {
    api.get('/api/products/mine')
      .then(list => setProducts(list.filter(p => p.status === 'published')))
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api.get(`/api/blog/mine/${id}`)
      .then(post => {
        setForm({
          title: post.title, excerpt: post.excerpt || '', body_markdown: post.body_markdown,
          featured_product_id: post.featured_product_id || ''
        });
        setExistingCoverPath(post.cover_path);
        setStatus(post.status);
        setRejectionNote(post.rejection_note);
        setLoading(false);
      })
      .catch(err => setError(err.message));
  }, [id, isEdit]);

  function update(key) {
    return e => setForm(f => ({ ...f, [key]: e.target.value }));
  }

  function handleCover(e) {
    const f = e.target.files[0];
    setCover(f);
    setCoverPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit(action) {
    setError(null);
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.body_markdown.trim()) { setError('The post body is required.'); return; }
    setSubmitting(true);

    const body = new FormData();
    body.append('title', form.title);
    body.append('excerpt', form.excerpt);
    body.append('body_markdown', form.body_markdown);
    body.append('featured_product_id', form.featured_product_id);
    body.append('status', action);
    if (cover) body.append('cover', cover);

    try {
      const post = isEdit
        ? await api.patch(`/api/blog/mine/${id}`, body)
        : await api.post('/api/blog/mine', body);
      // Editing an already-saved post navigates to the same URL it's
      // already on — the :id param doesn't change, so the effect that
      // fetches the post and sets `status` never re-runs on its own.
      // Setting it directly here is what actually keeps the button row
      // (which reads `status` to decide what to show) in sync with what
      // the server just did, not what it showed when the page first loaded.
      setStatus(post.status);
      setRejectionNote(post.rejection_note);
      // The server decides the real resulting status (a save on an
      // already-published/rejected post always lands as pending_review
      // regardless of which button was clicked — see routes/blog.js) —
      // the banner reflects what actually happened, not what was asked for.
      navigate(`/dashboard/blog/${post.id}/edit`, { state: { justSaved: post.status, at: Date.now() } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 640 }}>
        <div className="skeleton" style={{ height: 24, width: '50%', marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 240, borderRadius: 'var(--radius)' }} />
      </div>
    );
  }

  const shownCover = coverPreview || existingCoverPath;

  return (
    <div style={{ maxWidth: 640 }}>
      <Link to="/dashboard/blog" className="muted" style={{ fontSize: '.85rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <FiArrowLeft size={13} /> Your blog posts
      </Link>
      <h1 style={{ fontSize: '1.5rem', marginBottom: 6 }}>{isEdit ? 'Edit post' : 'New post'}</h1>

      {notice && (
        <div className="card card--pad" style={{ marginBottom: 20, borderColor: 'var(--green-glow)' }}>
          <span style={{ color: 'var(--green-glow)', fontWeight: 600 }}>{NOTICE_TEXT[notice] || 'Saved.'}</span>
        </div>
      )}

      {status === 'published' && (
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: 20 }}>
          This is live. Saving a real change here sends it back for a quick re-review before the edit shows publicly.
        </p>
      )}
      {status === 'rejected' && rejectionNote && (
        <p style={{ fontSize: '.88rem', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 6, color: 'var(--red)' }}>
          <FiAlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <span><strong>Changes requested:</strong> {rejectionNote}</span>
        </p>
      )}

      <div className="field">
        <label htmlFor="title">Title</label>
        <input id="title" required value={form.title} onChange={update('title')} placeholder="e.g. How I Priced My First Digital Product" autoFocus />
      </div>

      <div className="field">
        <label htmlFor="cover">Cover image</label>
        <FileUpload id="cover" accept="image/*" onChange={handleCover}
          label={shownCover ? 'Cover ready' : 'Choose a cover image'}
          hint="Shown on the blog list and at the top of the post."
          preview={shownCover} previewKind="image" crop={{ aspect: 16 / 9 }} />
      </div>

      <div className="field">
        <label htmlFor="excerpt">Excerpt (optional)</label>
        <textarea id="excerpt" rows={2} value={form.excerpt} onChange={update('excerpt')}
          placeholder="A one or two sentence teaser. Left blank, one gets built from the start of the post." />
      </div>

      <div className="field">
        <label htmlFor="body_markdown">Body (Markdown)</label>
        <textarea id="body_markdown" required rows={14} value={form.body_markdown} onChange={update('body_markdown')}
          style={{ fontFamily: 'monospace', fontSize: '.88rem' }}
          placeholder={'# A real heading\n\nReal paragraphs, **bold**, *italic*, [links](https://example.com), and lists all work.'} />
      </div>

      <div className="field">
        <label htmlFor="featured_product_id">Feature one of your products (optional)</label>
        <select id="featured_product_id" value={form.featured_product_id} onChange={update('featured_product_id')}>
          <option value="">None</option>
          {products?.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <small>
          {products?.length === 0
            ? "You don't have a published product yet — publish one first, then come back and feature it here."
            : 'Adds a real "want this?" card linking to it at the end of the post.'}
        </small>
      </div>

      <div className="field">
        <label>Live preview</label>
        <div className="card card--pad" style={{ lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(form.body_markdown) || '<p class="muted">Nothing to preview yet.</p>' }} />
      </div>

      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}

      {/* Once a post has gone through review once, saving it — draft
          button or not — always resubmits it for review (see routes/
          blog.js's PATCH /mine/:id), so a "Save as draft" button here
          would do something other than what it says. Only offer the
          real choice (draft privately, vs submit) before that's ever
          happened. */}
      <div className="btn-row">
        {(!status || status === 'draft') && (
          <button className="btn btn--ghost" disabled={submitting} onClick={() => submit('draft')}>
            {submitting ? 'Saving...' : 'Save as draft'}
          </button>
        )}
        <button className="btn btn--primary" style={{ flex: 1 }} disabled={submitting} onClick={() => submit('submit')}>
          {submitting ? 'Saving...' : !status || status === 'draft' ? 'Submit for review' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
