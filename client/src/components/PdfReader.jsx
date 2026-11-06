import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist/build/pdf';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { FiX, FiMinus, FiPlus, FiDownload, FiAlertCircle, FiSun, FiMoon, FiBookOpen } from 'react-icons/fi';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.6;
const ZOOM_STEP = 0.2;
const RENDER_AHEAD = 2; // pages kept rendered either side of the visible one
const THEMES = ['paper', 'sepia', 'night'];

function progressKey(src) {
  return `scorpio_read_${src.replace(/[^a-z0-9]/gi, '_').slice(-80)}`;
}

export function readPosition(src) {
  try {
    const raw = JSON.parse(localStorage.getItem(progressKey(src)) || 'null');
    return raw && Number.isInteger(raw.page) ? raw : null;
  } catch { return null; }
}

function savePosition(src, page, total) {
  try { localStorage.setItem(progressKey(src), JSON.stringify({ page, total })); } catch { /* storage blocked */ }
}

// A full-screen document reader. Pages are rendered to canvases on demand as
// they scroll into view (and released when far away) so a 300-page PDF stays
// light on a cheap phone, and the file itself arrives in ranged pieces.
export default function PdfReader({ src, title, downloadUrl, onClose }) {
  const [doc, setDoc] = useState(null);
  const [loadPct, setLoadPct] = useState(0);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('scorpio_reader_theme') || 'paper'; } catch { return 'paper'; }
  });
  const [pageInput, setPageInput] = useState('');
  const [baseWidth, setBaseWidth] = useState(0);
  const [ratio, setRatio] = useState(1.414); // height / width, corrected once page 1 loads

  const scrollRef = useRef(null);
  const pageRefs = useRef(new Map());
  const rendered = useRef(new Map()); // pageNumber -> { task, scale }
  const visible = useRef(new Set());
  const closeRef = useRef(null);

  // Load the document.
  useEffect(() => {
    let cancelled = false;
    const task = pdfjs.getDocument({ url: src, withCredentials: true, disableAutoFetch: true, disableStream: false, isEvalSupported: false });
    task.onProgress = ({ loaded, total }) => { if (!cancelled && total) setLoadPct(Math.min(99, Math.round((loaded / total) * 100))); };
    task.promise.then(async pdf => {
      if (cancelled) return;
      const first = await pdf.getPage(1);
      const vp = first.getViewport({ scale: 1 });
      if (cancelled) return;
      setRatio(vp.height / vp.width);
      setDoc(pdf);
      const saved = readPosition(src);
      if (saved && saved.page > 1 && saved.page <= pdf.numPages) {
        requestAnimationFrame(() => pageRefs.current.get(saved.page)?.scrollIntoView({ block: 'start' }));
        setPage(saved.page);
      }
    }).catch(err => {
      if (cancelled) return;
      const name = err?.name || '';
      setError(name === 'PasswordException' ? 'This document is password protected and cannot be opened here.'
        : name === 'InvalidPDFException' ? 'This file is not a PDF, so it cannot be read in the app.'
          : err?.status === 403 || err?.status === 401 ? 'You do not have access to this document.'
            : 'We could not load this document. Check your connection and try again.');
    });
    return () => { cancelled = true; task.destroy(); };
  }, [src]);

  // Measure available width so "fit to screen" is real on every device.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const measure = () => setBaseWidth(Math.max(240, Math.min(el.clientWidth - 24, 980)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const width = Math.round(baseWidth * zoom);

  const renderPage = useCallback(async (n) => {
    if (!doc || !width) return;
    const existing = rendered.current.get(n);
    if (existing && existing.width === width) return;
    existing?.task?.cancel?.();
    const holder = pageRefs.current.get(n);
    const canvas = holder?.querySelector('canvas');
    if (!canvas) return;
    try {
      const pdfPage = await doc.getPage(n);
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = width / base.width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({ scale: scale * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
      const task = pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport });
      rendered.current.set(n, { task, width });
      await task.promise;
      holder.classList.add('is-rendered');
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') console.error('[reader] page render failed', n, err);
    }
  }, [doc, width]);

  const releasePage = useCallback((n) => {
    const entry = rendered.current.get(n);
    if (!entry) return;
    entry.task?.cancel?.();
    rendered.current.delete(n);
    const holder = pageRefs.current.get(n);
    const canvas = holder?.querySelector('canvas');
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    holder?.classList.remove('is-rendered');
  }, []);

  // Render what is near the viewport, release what is far from it, and track
  // the page the reader is actually looking at.
  useEffect(() => {
    if (!doc || !width) return undefined;
    rendered.current.forEach((entry, n) => { if (entry.width !== width) releasePage(n); });
    const root = scrollRef.current;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const n = Number(entry.target.dataset.page);
        if (entry.isIntersecting) visible.current.add(n); else visible.current.delete(n);
      }
      const near = [...visible.current];
      if (near.length === 0) return;
      const lo = Math.min(...near);
      const hi = Math.max(...near);
      for (let n = Math.max(1, lo - RENDER_AHEAD); n <= Math.min(doc.numPages, hi + RENDER_AHEAD); n += 1) renderPage(n);
      rendered.current.forEach((_, n) => { if (n < lo - RENDER_AHEAD - 3 || n > hi + RENDER_AHEAD + 3) releasePage(n); });

      // The current page is the one whose top is nearest the middle of the screen.
      const mid = root.getBoundingClientRect().top + root.clientHeight / 2;
      let best = near[0];
      let bestDist = Infinity;
      for (const n of near) {
        const r = pageRefs.current.get(n)?.getBoundingClientRect();
        if (!r) continue;
        const dist = Math.abs((r.top + r.bottom) / 2 - mid);
        if (dist < bestDist) { best = n; bestDist = dist; }
      }
      setPage(best);
    }, { root, rootMargin: '600px 0px', threshold: [0, 0.01] });
    pageRefs.current.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [doc, width, renderPage, releasePage]);

  useEffect(() => { if (doc) savePosition(src, page, doc.numPages); }, [src, page, doc]);

  // Lock the page behind the reader, handle Escape, restore on close.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const live = rendered.current;
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
      live.forEach(entry => entry.task?.cancel?.());
    };
  }, [onClose]);

  function cycleTheme() {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    setTheme(next);
    try { localStorage.setItem('scorpio_reader_theme', next); } catch { /* ignore */ }
  }

  function jump(e) {
    e.preventDefault();
    const n = Math.min(Math.max(parseInt(pageInput, 10) || 1, 1), doc.numPages);
    pageRefs.current.get(n)?.scrollIntoView({ block: 'start' });
    setPageInput('');
  }

  const total = doc?.numPages || 0;
  const pct = total ? Math.round((page / total) * 100) : 0;
  const placeholderHeight = Math.round(width * ratio);

  return (
    <div className={`reader reader--${theme}`} role="dialog" aria-modal="true" aria-label={`Reading ${title}`}>
      <div className="reader__bar">
        <button type="button" ref={closeRef} className="reader__btn" onClick={onClose} aria-label="Close reader"><FiX size={18} /></button>
        <div className="reader__title">
          <FiBookOpen size={14} aria-hidden="true" />
          <span>{title}</span>
        </div>
        {doc && (
          <form className="reader__page" onSubmit={jump}>
            <input
              inputMode="numeric" aria-label="Go to page" value={pageInput}
              onChange={e => setPageInput(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder={String(page)}
            />
            <span>/ {total}</span>
          </form>
        )}
        <div className="reader__tools">
          <button type="button" className="reader__btn" onClick={() => setZoom(z => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out"><FiMinus size={16} /></button>
          <button type="button" className="reader__btn" onClick={() => setZoom(z => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in"><FiPlus size={16} /></button>
          <button type="button" className="reader__btn" onClick={cycleTheme} aria-label={`Reading theme: ${theme}. Change theme`}>
            {theme === 'night' ? <FiMoon size={16} /> : <FiSun size={16} />}
          </button>
          {downloadUrl && <a href={downloadUrl} className="reader__btn" aria-label="Download a copy"><FiDownload size={16} /></a>}
        </div>
      </div>
      <div className="reader__progress" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>

      <div className="reader__scroll" ref={scrollRef}>
        {error && (
          <div className="reader__state">
            <FiAlertCircle size={30} />
            <p>{error}</p>
            <div className="reader__state-actions">
              {downloadUrl && <a href={downloadUrl} className="btn btn--cta btn--sm"><FiDownload size={14} /> Download instead</a>}
              <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Close</button>
            </div>
          </div>
        )}
        {!error && !doc && (
          <div className="reader__state" role="status">
            <div className="reader__spinner" />
            <p>Opening your document{loadPct ? ` · ${loadPct}%` : '...'}</p>
          </div>
        )}
        {doc && Array.from({ length: total }, (_, i) => i + 1).map(n => (
          <div
            key={n}
            data-page={n}
            className="reader__page-holder"
            ref={el => { if (el) pageRefs.current.set(n, el); else pageRefs.current.delete(n); }}
            style={{ width, minHeight: placeholderHeight }}
          >
            <canvas aria-label={`Page ${n} of ${total}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
