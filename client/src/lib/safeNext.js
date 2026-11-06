// A return path must stay on this site. "//evil.com" and "/\\evil.com" both
// start with a slash but browsers read them as another host.
export function safeNext(next) {
  return typeof next === 'string' && /^\/(?![/\\])/.test(next) ? next : null;
}
