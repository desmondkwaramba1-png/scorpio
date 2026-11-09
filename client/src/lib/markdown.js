import { marked } from 'marked';
import DOMPurify from 'dompurify';

// The only place raw admin-authored markdown becomes real DOM
// (dangerouslySetInnerHTML) — BlogPost.jsx's real render and the admin
// editor's live preview both go through this one function, never their
// own separate parse+sanitize calls. Only admins holding ADMIN_KEY write
// this content (see adminAuth.js), so the actual risk is low, but
// sanitizing anyway costs nothing and means a future contributor adding a
// second admin-writable field doesn't have to remember to.
export function renderMarkdown(md) {
  if (!md) return '';
  const html = marked.parse(md, { breaks: true, gfm: true });
  // The post title is the page's h1, so headings written in the body start at h2.
  return DOMPurify.sanitize(html.replace(/<(\/?)h1\b/g, '<$1h2'));
}

// Cheap and real — no reading-speed field to maintain, just word count.
export function readingTime(md) {
  if (!md) return 1;
  const words = md.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

// A blank excerpt falls back to this — strip the most common markdown
// syntax so a heading's "#" or a link's brackets don't show up as noise
// in a teaser, then truncate to a sentence-ish length.
export function plainTextExcerpt(md, maxLen = 160) {
  if (!md) return '';
  const stripped = md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length > maxLen ? stripped.slice(0, maxLen).trim() + '…' : stripped;
}
