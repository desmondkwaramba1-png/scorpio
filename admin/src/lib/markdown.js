import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function renderMarkdown(md) {
  if (!md || !md.trim()) return '';
  return DOMPurify.sanitize(marked.parse(md).replace(/<(\/?)h1\b/g, '<$1h2'));
}
