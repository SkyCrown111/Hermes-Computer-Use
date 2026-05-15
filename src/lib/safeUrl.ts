/** Allowed URL schemes for user-rendered Markdown links and images. */
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'data:']);

/**
 * Returns true when href is safe to render in <a> or <img src>.
 * Blocks javascript:, vbscript:, file:, and other dangerous schemes.
 */
export function isSafeUrl(href: string | null | undefined): boolean {
  if (!href || !href.trim()) {
    return false;
  }

  const trimmed = href.trim();

  if (/^file:/i.test(trimmed)) {
    return false;
  }

  // Reject free-form text with spaces (not valid URLs or paths)
  if (/\s/.test(trimmed) && !trimmed.toLowerCase().startsWith('mailto:')) {
    return false;
  }

  // Relative paths and anchors are allowed
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('#')
  ) {
    return true;
  }

  try {
    const url = new URL(trimmed, 'https://local.invalid');
    if (url.protocol === 'https:' && url.hostname === 'local.invalid') {
      // Relative URL resolved against base — allow if no dangerous scheme in input
      return !/^\s*javascript:/i.test(trimmed) && !/^\s*vbscript:/i.test(trimmed);
    }
    return ALLOWED_SCHEMES.has(url.protocol);
  } catch {
    return false;
  }
}
