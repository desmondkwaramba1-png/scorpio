// The Web Share API hands off to the OS share sheet, which is the only way
// to genuinely "share to Instagram/TikTok" — neither platform exposes a web
// URL that opens their share composer with a pre-filled link, so a website
// button that claims to do that is lying. The OS sheet has no such
// limitation: it lists whatever's actually installed on the device.
export function canNativeShare() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

// Resolves to 'native' (handed off to the OS sheet), 'copy_link' (clipboard
// fallback), or null (user cancelled the native sheet — not a failure).
export async function shareOrCopy({ title, text, url }) {
  if (canNativeShare()) {
    try {
      await navigator.share({ title, text, url });
      return 'native';
    } catch (err) {
      if (err?.name === 'AbortError') return null;
      // fall through to clipboard for any other failure (e.g. share() denied)
    }
  }
  await navigator.clipboard.writeText(url);
  return 'copy_link';
}
