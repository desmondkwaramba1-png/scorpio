import { useEffect } from 'react';

function setMeta(attr, key, content) {
  if (!content) return;
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

// No react-helmet-async — this app has zero client-side dependency
// overhead for meta tags today, and adding one isn't worth it for what's
// really a handful of setAttribute calls. Real, honest limitation worth
// stating plainly: this only helps crawlers that execute JavaScript
// (Google's own crawler does). WhatsApp, Facebook, and Twitter's link-
// preview bots do NOT run JS — they read the raw HTML on first response,
// so a shared product link still won't show a nice image/title card from
// this alone. That needs server-rendered meta tags (a bot-specific
// response from the actual HTTP layer, not a client-side DOM update),
// which is a real, separate, larger piece of work, not something to fake
// here.
export function useSEO({ title, description, image, url }) {
  useEffect(() => {
    const previousTitle = document.title;
    if (title) document.title = title;

    setMeta('name', 'description', description);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:image', image);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:type', 'website');
    setMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', image);

    // Restore the site default on unmount so navigating away (to a page
    // that doesn't call useSEO itself) doesn't leave a stale product title
    // sitting in the browser tab.
    return () => { document.title = previousTitle; };
  }, [title, description, image, url]);
}
