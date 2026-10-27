import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { FiArrowLeft, FiUsers, FiX, FiExternalLink } from 'react-icons/fi';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext.jsx';
import FileUpload from '../../components/FileUpload.jsx';
import UploadProgress from '../../components/UploadProgress.jsx';
import useLeaveGuard from '../../lib/useLeaveGuard.js';
import { EBOOKS_ONLY } from '../../lib/launchScope.js';

// Mirrors the server's launch-scope rule for product/issue files.
const ISSUE_FILE_ACCEPT = EBOOKS_ONLY ? 'application/pdf,video/mp4,video/webm,video/quicktime' : undefined;

// Publishing a new issue is a different action from editing a product's
// price/cover/description, and burying it inside "Edit product" made it
// read as a settings tweak instead of what it actually is: sending new
// content straight to people who already paid. This is its own page for
// exactly that reason, reachable directly from the products list.
export default function ProductIssues() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { creator } = useAuth();

  const [product, setProduct] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [issues, setIssues] = useState(null);
  const [issuesError, setIssuesError] = useState(null);
  const [newIssue, setNewIssue] = useState({ title: '', external_url: '' });
  const [newIssueFile, setNewIssueFile] = useState(null);
  const [addingIssue, setAddingIssue] = useState(false);
  const [issueError, setIssueError] = useState(null);
  const [issueProgress, setIssueProgress] = useState(0);
  useLeaveGuard(addingIssue);

  useEffect(() => {
    api.get('/api/products/mine')
      .then(products => {
        const p = products.find(p => String(p.id) === id);
        if (!p) { setLoadError('Product not found.'); return; }
        if (!['serial', 'subscription'].includes(p.type)) {
          navigate(`/dashboard/products/${id}/edit`, { replace: true });
          return;
        }
        setProduct(p);
      })
      .catch(err => setLoadError(err.message));
  }, [id, navigate]);

  useEffect(() => {
    if (!product) return;
    setIssues(null);
    setIssuesError(null);
    api.get(`/api/products/${product.slug}`)
      .then(p => setIssues(p.issues || []))
      .catch(err => setIssuesError(err.message));
  }, [product]);

  async function addIssue(e) {
    e.preventDefault();
    setIssueError(null);
    if (!newIssue.title.trim()) { setIssueError('Give this issue a title.'); return; }
    if (!newIssueFile && !newIssue.external_url.trim()) {
      setIssueError('Attach a file or paste a link, buyers need something to actually get.');
      return;
    }
    setAddingIssue(true);
    setIssueProgress(0);
    const body = new FormData();
    body.append('title', newIssue.title);
    if (newIssue.external_url.trim()) body.append('external_url', newIssue.external_url.trim());
    if (newIssueFile) body.append('file', newIssueFile);
    try {
      // api.post has a 15s total timeout, far too short for a real PDF or
      // video on mobile data. This watchdog only fires when no bytes move.
      const created = await api.uploadWithProgress(`/api/products/${product.id}/issues`, 'POST', body, setIssueProgress, 120000);
      setIssues(list => [{ ...created, unlocked: true }, ...list]);
      setNewIssue({ title: '', external_url: '' });
      setNewIssueFile(null);
    } catch (err) {
      setIssueError(err.message);
    } finally {
      setAddingIssue(false);
    }
  }

  async function removeIssue(issueId) {
    try {
      await api.delete(`/api/products/${product.id}/issues/${issueId}`);
      setIssues(list => list.filter(i => i.id !== issueId));
    } catch (err) {
      setIssueError(err.message);
    }
  }

  if (loadError) return <div><p className="error-text">{loadError}</p></div>;
  if (!product) {
    return (
      <div style={{ maxWidth: 560 }}>
        <div className="skeleton" style={{ height: 24, width: '60%', marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 200, borderRadius: 'var(--radius)' }} />
      </div>
    );
  }

  const isSubscription = product.type === 'subscription';

  return (
    <div style={{ maxWidth: 560 }}>
      <Link to={`/dashboard/products/${id}/edit`} className="muted" style={{ fontSize: '.85rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <FiArrowLeft size={13} /> Edit product details
      </Link>

      <h1 style={{ fontSize: '1.5rem', marginBottom: 4 }}>Publish to {product.title}</h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        {isSubscription
          ? 'Every currently-subscribed buyer gets this the moment you publish it, and an email telling them it\'s out. Someone who lapsed stops receiving new issues until they renew.'
          : "Every past and future buyer gets this the moment you publish it, and an email telling them it's out. No separate unlock step, they already paid once."}
      </p>

      {isSubscription && (
        <Link to={`/dashboard/subscriptions?product_id=${product.id}`} className="btn btn--ghost btn--sm" style={{ marginBottom: 24 }}>
          <FiUsers size={13} /> View subscribers
        </Link>
      )}

      <div className="card card--pad" style={{ marginBottom: 28 }}>
        <p style={{ fontWeight: 700, marginBottom: 16 }}>New issue</p>
        <form onSubmit={addIssue}>
          <div className="field">
            <label htmlFor="issue_title">Title</label>
            <input id="issue_title" value={newIssue.title} autoFocus
              onChange={e => setNewIssue(i => ({ ...i, title: e.target.value }))}
              placeholder={`Issue ${(issues?.length || 0) + 1}`} />
          </div>
          <div className="field">
            <label htmlFor="issue_file">File</label>
            <FileUpload id="issue_file" accept={ISSUE_FILE_ACCEPT} maxBytes={500 * 1024 * 1024}
              onChange={e => setNewIssueFile(e.target.files[0] || null)}
              label={EBOOKS_ONLY ? 'Choose a PDF or video' : 'Choose a file'} />
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label htmlFor="issue_url">Or a link instead</label>
            <input id="issue_url" value={newIssue.external_url}
              onChange={e => setNewIssue(i => ({ ...i, external_url: e.target.value }))}
              placeholder="https://..." />
            <small>Use one or the other, a file you upload here, or a link to where it already lives.</small>
          </div>
          {issueError && <p className="error-text" role="alert" style={{ marginBottom: 10 }}>{issueError}</p>}
          {addingIssue && newIssueFile && <UploadProgress progress={issueProgress} label="Uploading issue" />}
          <button type="submit" className="btn btn--primary" disabled={addingIssue}>
            {addingIssue ? 'Publishing...' : 'Publish issue'}
          </button>
        </form>
      </div>

      <p style={{ fontWeight: 700, marginBottom: 12 }}>Published issues</p>
      {issuesError ? (
        <p className="error-text">{issuesError}</p>
      ) : issues === null ? (
        <p className="muted" style={{ fontSize: '.85rem' }}>Loading...</p>
      ) : issues.length === 0 ? (
        <p className="muted" style={{ fontSize: '.85rem' }}>Nothing published yet, use the form above.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {issues.map(iss => (
            <div key={iss.id} className="card card--pad" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10
            }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: '.9rem' }}>Issue {iss.issue_number}: {iss.title}</p>
                <p className="muted" style={{ fontSize: '.78rem' }}>{new Date(iss.published_at).toLocaleDateString()}</p>
              </div>
              <button type="button" onClick={() => removeIssue(iss.id)} className="btn btn--ghost btn--sm" title="Remove issue">
                <FiX size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {creator && (
        <p style={{ marginTop: 28 }}>
          <Link to={`/@${creator.handle}/${product.slug}`} className="muted" style={{ fontSize: '.85rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <FiExternalLink size={13} /> View public listing
          </Link>
        </p>
      )}
    </div>
  );
}
