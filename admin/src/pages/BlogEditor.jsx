import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { FiAlertTriangle } from 'react-icons/fi';
import { useAdmin } from '../context/AdminContext.jsx';
import { renderMarkdown } from '../lib/markdown';
import { SITE_ORIGIN } from '../lib/site';

const EMPTY_FORM = { title: '', slug: '', excerpt: '', author_name: 'SCORPIO Team', body_markdown: '' };

const STATUS_LABEL = {
  draft: 'Draft', pending_review: 'Pending review', published: 'Published', rejected: 'Rejected'
};

export default function BlogEditor() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const location = useLocation();
  const { adminFetch, adminPost, adminUpload } = useAdmin();

  const [form, setForm] = useState(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [cover, setCover] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [existingCoverPath, setExistingCoverPath] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  // Read-only context about who actually wrote this — an admin editing a
  // creator's submission needs to see that plainly, not mistake it for
  // one of the platform's own posts.
  const [meta, setMeta] = useState(null);

  // navigate() after a save always carries a fresh state object (even when
  // landing on the same URL a second save already sits on), so this fires
  // every time, not just on the first mount - without it, hitting Publish
  // just silently swapped "New post" for "Edit post" with nothing else
  // changing, easy to miss and read as "did that even do anything."
  useEffect(() => {
    if (!location.state?.justSaved) return;
    setNotice(location.state);
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [location.state]);

  useEffect(() => {
    if (!isEdit) return;
    adminFetch(`/api/blog/admin/posts/${id}`)
      .then(post => {
        setForm({
          title: post.title, slug: post.slug, excerpt: post.excerpt || '',
          author_name: post.author_name, body_markdown: post.body_markdown
        });
        setExistingCoverPath(post.cover_path);
        setSlugTouched(true);
        setMeta({
          status: post.status, creatorHandle: post.creator_handle, rejectionNote: post.rejection_note,
          featuredProductTitle: post.featured_product_title
        });
        setLoading(false);
      })
      .catch(err => setError(err.message));
  }, [id, isEdit, adminFetch]);

  async function review(action) {
    setSubmitting(true);
    setError(null);
    try {
      let updated;
      if (action === 'approve') {
        updated = await adminPost(`/api/blog/admin/posts/${id}/approve`);
      } else {
        const note = window.prompt('What needs to change? This goes straight to the creator.');
        if (!note || !note.trim()) { setSubmitting(false); return; }
        updated = await adminPost(`/api/blog/admin/posts/${id}/reject`, { note: note.trim() });
      }
      setMeta(m => ({ ...m, status: updated.status, rejectionNote: updated.rejection_note }));
      setNotice({ justSaved: updated.status, slug: updated.slug, at: Date.now() });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function updateTitle(e) {
    const title = e.target.value;
    setForm(f => ({
      ...f, title,
      slug: !isEdit && !slugTouched ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : f.slug
    }));
  }

  function update(key) {
    return e => setForm(f => ({ ...f, [key]: e.target.value }));
  }

  function handleCover(e) {
    const f = e.target.files[0];
    setCover(f);
    setCoverPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit(status) {
    setError(null);
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.body_markdown.trim()) { setError('The post body is required.'); return; }
    setSubmitting(true);

    const body = new FormData();
    Object.entries(form).forEach(([k, v]) => body.append(k, v));
    body.append('status', status);
    if (cover) body.append('cover', cover);

    try {
      const post = isEdit
        ? await adminUpload(`/api/blog/admin/posts/${id}`, 'PATCH', body)
        : await adminUpload('/api/blog/admin/posts', 'POST', body);
      // Editing an already-saved post navigates to the same URL it's
      // already on, so the id-keyed fetch effect that originally set
      // `meta` never re-runs on its own — without this, the button row
      // (which reads meta.status to decide its own label) kept reading
      // stale pre-save state, "Publish" sitting there after a post had
      // already gone live.
      setMeta(m => ({ ...(m || {}), status: post.status }));
      navigate(`/blog/${post.id}/edit`, { state: { justSaved: status, slug: post.slug, at: Date.now() } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="muted">Loading...</p>;

  const shownCover = coverPreview || existingCoverPath;

  return (
    <div style={{ maxWidth: 720 }}>
      <Link to="/blog" className="muted" style={{ fontSize: '.85rem', fontWeight: 600 }}>&larr; All posts</Link>
      <h2 style={{ margin: '12px 0 16px' }}>{isEdit ? 'Edit post' : 'New post'}</h2>

      {meta?.creatorHandle && (
        <div className="card card--pad" style={{ marginBottom: 20 }}>
          <p style={{ fontSize: '.88rem' }}>
            Submitted by <strong>@{meta.creatorHandle}</strong> &middot; {STATUS_LABEL[meta.status] || meta.status}
            {meta.featuredProductTitle && <> &middot; features "{meta.featuredProductTitle}"</>}
          </p>
          {meta.status === 'rejected' && meta.rejectionNote && (
            <p style={{ fontSize: '.85rem', marginTop: 8, display: 'flex', alignItems: 'flex-start', gap: 6, color: 'var(--red)' }}>
              <FiAlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {meta.rejectionNote}
            </p>
          )}
          {meta.status === 'pending_review' && (
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn btn--gold" disabled={submitting} onClick={() => review('approve')}>Approve &amp; publish</button>
              <button className="btn btn--ghost" disabled={submitting} onClick={() => review('reject')}>Reject</button>
            </div>
          )}
        </div>
      )}

      {notice && (
        <div className="card card--pad" style={{
          marginBottom: 20, borderColor: 'var(--green-glow)', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap'
        }}>
          <span style={{ color: 'var(--green-glow)', fontWeight: 600 }}>
            {notice.justSaved === 'published' ? 'Published — it\'s live now.'
              : notice.justSaved === 'pending_review' ? 'Sent back for review.'
              : notice.justSaved === 'rejected' ? 'Rejected — the creator can see why and resubmit.'
              : 'Saved as a draft. Not visible on the blog yet.'}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            {notice.justSaved === 'published' && (
              <a href={`${SITE_ORIGIN}/blog/${notice.slug}`} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">View live</a>
            )}
            <Link to="/blog" className="btn btn--ghost btn--sm">All posts</Link>
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="title">Title</label>
        <input id="title" required value={form.title} onChange={updateTitle} placeholder="e.g. How to Start an Online Business in Zimbabwe" />
      </div>

      <div className="field">
        <label htmlFor="slug">URL slug</label>
        <input id="slug" required value={form.slug} onChange={e => { setSlugTouched(true); update('slug')(e); }} />
        {isEdit && <small>Changing this breaks the current link to this post if it's already been shared.</small>}
      </div>

      <div className="field">
        <label htmlFor="cover">Cover image</label>
        <input id="cover" type="file" accept="image/*" onChange={handleCover} />
        {shownCover && (
          <div style={{ marginTop: 10, width: 200, aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden', background: `url(${shownCover}) center/cover` }} />
        )}
        <small>Shown on the blog list and at the top of the post.</small>
      </div>

      <div className="field">
        <label htmlFor="excerpt">Excerpt (optional)</label>
        <textarea id="excerpt" rows={2} value={form.excerpt} onChange={update('excerpt')}
          placeholder="A one or two sentence teaser. Left blank, one gets built from the start of the post." />
      </div>

      <div className="field">
        <label htmlFor="author_name">Author name</label>
        <input id="author_name" value={form.author_name} onChange={update('author_name')} />
      </div>

      <div className="field">
        <label htmlFor="body_markdown">Body (Markdown)</label>
        <textarea id="body_markdown" required rows={16} value={form.body_markdown} onChange={update('body_markdown')}
          style={{ fontFamily: 'monospace', fontSize: '.88rem' }}
          placeholder={'# A real heading\n\nReal paragraphs, **bold**, *italic*, [links](https://example.com), and lists all work.'} />
      </div>

      <div className="field">
        <label>Live preview</label>
        <div className="card card--pad" style={{ lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(form.body_markdown) || '<p class="muted">Nothing to preview yet.</p>' }} />
      </div>

      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}

      <div className="btn-row">
        <button className="btn btn--ghost" disabled={submitting} onClick={() => submit('draft')}>
          {submitting ? 'Saving...' : meta?.status === 'published' ? 'Unpublish (save as draft)' : 'Save as draft'}
        </button>
        <button className="btn btn--gold" style={{ flex: 1 }} disabled={submitting} onClick={() => submit('published')}>
          {submitting ? 'Saving...' : meta?.status === 'published' ? 'Save changes' : 'Publish'}
        </button>
      </div>
    </div>
  );
}
