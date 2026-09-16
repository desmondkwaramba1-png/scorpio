import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import { adminApi } from '../../lib/api';
import AdminKeyGate from '../../components/AdminKeyGate.jsx';
import FileUpload from '../../components/FileUpload.jsx';
import { renderMarkdown } from '../../lib/markdown';

const EMPTY_FORM = { title: '', slug: '', excerpt: '', author_name: 'SCORPIO Team', body_markdown: '' };

function Editor({ adminKey, onInvalidKey }) {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [cover, setCover] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [existingCoverPath, setExistingCoverPath] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isEdit) return;
    adminApi.get(`/api/blog/admin/posts/${id}`, adminKey)
      .then(post => {
        setForm({
          title: post.title, slug: post.slug, excerpt: post.excerpt || '',
          author_name: post.author_name, body_markdown: post.body_markdown
        });
        setExistingCoverPath(post.cover_path);
        setSlugTouched(true); // an existing slug is never auto-overwritten by title edits
        setLoading(false);
      })
      .catch(err => {
        if (err.message === 'Invalid admin key.') onInvalidKey();
        else setError(err.message);
      });
  }, [id, isEdit, adminKey]);

  function update(key) {
    return e => setForm(f => ({ ...f, [key]: e.target.value }));
  }

  function updateTitle(e) {
    const title = e.target.value;
    setForm(f => ({
      ...f, title,
      // Only auto-fills the slug on create, before the admin has touched
      // it themselves — never on edit (would silently break a link
      // that's already been shared), and never once they've typed into
      // the slug field directly.
      slug: !isEdit && !slugTouched ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : f.slug
    }));
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
        ? await adminApi.patch(`/api/blog/admin/posts/${id}`, body, adminKey)
        : await adminApi.post('/api/blog/admin/posts', body, adminKey);
      navigate(`/admin/blog/${post.id}/edit`);
    } catch (err) {
      if (err.message === 'Invalid admin key.') onInvalidKey();
      else setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="wrap" style={{ padding: '40px 20px 80px', maxWidth: 720 }}>
        <div className="skeleton" style={{ height: 40, width: '50%', marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    );
  }

  const shownCover = coverPreview || existingCoverPath;

  return (
    <div className="wrap" style={{ padding: '32px 20px 80px', maxWidth: 720 }}>
      <Link to="/admin/blog" className="blog-post__back"><FiArrowLeft size={14} /> All posts</Link>
      <h1 style={{ fontSize: '1.5rem', margin: '12px 0 24px' }}>{isEdit ? 'Edit post' : 'New post'}</h1>

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
        <div className="blog-post__body card card--pad" dangerouslySetInnerHTML={{ __html: renderMarkdown(form.body_markdown) || '<p class="muted">Nothing to preview yet.</p>' }} />
      </div>

      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}

      <div className="btn-row">
        <button className="btn btn--ghost" disabled={submitting} onClick={() => submit('draft')}>
          {submitting ? 'Saving...' : 'Save as draft'}
        </button>
        <button className="btn btn--gold" style={{ flex: 1 }} disabled={submitting} onClick={() => submit('published')}>
          {submitting ? 'Saving...' : 'Publish'}
        </button>
      </div>
    </div>
  );
}

export default function AdminBlogEditor() {
  return <AdminKeyGate>{(key, onInvalidKey) => <Editor adminKey={key} onInvalidKey={onInvalidKey} />}</AdminKeyGate>;
}
