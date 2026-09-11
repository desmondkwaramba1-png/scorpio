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
// Structured data (JSON-LD) is separate from the meta tags above: it's
// what lets Google actually understand "this is a Product, this is its
// price, this is whether it's in stock" instead of guessing from prose —
// the difference between a plain blue link and a rich result with a price
// shown right in search. Google's crawler runs JS (confirmed live: it gets
// the full rendered SPA, not a stub), so injecting this client-side does
// reach it, unlike the link-preview problem useSEO's og:/twitter: tags
// have with non-JS bots.
function setJsonLd(data) {
  const id = 'seo-jsonld';
  let el = document.getElementById(id);
  if (!data) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

export function useSEO({ title, description, image, url, jsonLd, noindex }) {
  useEffect(() => {
    const previousTitle = document.title;
    if (title) document.title = title;

    setMeta('name', 'robots', noindex ? 'noindex, follow' : 'index, follow');
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
    setJsonLd(jsonLd);

    // Restore the site default on unmount so navigating away (to a page
    // that doesn't call useSEO itself) doesn't leave a stale product title
    // sitting in the browser tab, or a stale JSON-LD block describing a
    // product that's no longer the one on screen.
    return () => { document.title = previousTitle; setJsonLd(null); setMeta('name', 'robots', 'index, follow'); };
  }, [title, description, image, url, jsonLd, noindex]);
}
