import { lazy, Suspense, useState } from 'react';
import { FiBookOpen, FiDownload } from 'react-icons/fi';

// The reader (and the PDF engine behind it) is only fetched when someone
// actually starts reading, so it costs nothing for everyone else.
const PdfReader = lazy(() => import('./PdfReader.jsx'));

function savedPage(src) {
  try {
    const raw = JSON.parse(localStorage.getItem(`scorpio_read_${src.replace(/[^a-z0-9]/gi, '_').slice(-80)}`) || 'null');
    return raw && Number.isInteger(raw.page) ? raw : null;
  } catch { return null; }
}

// Replaces the old <iframe>, which phones routinely render blank or as a
// single page. `src` is the document's /view URL; the reader streams the same
// document from its sibling /stream URL (same access rules, ranged reads).
export default function DocumentViewer({ src, title, downloadUrl }) {
  const [open, setOpen] = useState(false);
  const streamUrl = src.replace(/\/view$/, '/stream');
  const saved = savedPage(streamUrl);

  return (
    <div className="doc-card">
      <div className="doc-card__icon" aria-hidden="true"><FiBookOpen size={22} /></div>
      <div className="doc-card__text">
        <p className="doc-card__title">{title}</p>
        <p className="doc-card__sub">
          {saved && saved.page > 1 ? `Continue from page ${saved.page}${saved.total ? ` of ${saved.total}` : ''}` : 'Read it right here, no download needed.'}
        </p>
      </div>
      <div className="doc-card__actions">
        <button type="button" className="btn btn--cta btn--sm" onClick={() => setOpen(true)}>
          <FiBookOpen size={14} /> {saved && saved.page > 1 ? 'Continue reading' : 'Start reading'}
        </button>
        {downloadUrl && <a href={downloadUrl} className="btn btn--ghost btn--sm" aria-label="Download a copy"><FiDownload size={14} /></a>}
      </div>
      {open && (
        <Suspense fallback={<div className="reader reader--paper"><div className="reader__state" role="status"><div className="reader__spinner" /><p>Opening the reader...</p></div></div>}>
          <PdfReader src={streamUrl} title={title} downloadUrl={downloadUrl} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
