/** Only canonical, relative, workspace routes are valid post-auth destinations. */
export function getSafeReturnTo(search: string): string | null {
  const value = new URLSearchParams(search).get('returnTo');
  if (!value || !value.startsWith('/workspaces') || /[\\\u0000-\u0020]/.test(value)) return null;
  try {
    const rawPath = decodeURIComponent(value.split(/[?#]/)[0]);
    if (rawPath.split('/').some(part => part === '.' || part === '..') || /%2f|%5c/i.test(value.split(/[?#]/)[0])) return null;
    const url = new URL(value, 'https://app.invalid');
    if (url.origin !== 'https://app.invalid') return null;
    const segment = '[^/\\\\?#%]+';
    const valid = new RegExp('^/workspaces(?:/' + segment + '(?:/(?:characters(?:/' + segment + ')?|attacks|combos|analysis|simulation|director|import|help))?)?/?$');
    const decoded = decodeURIComponent(url.pathname);
    if (!valid.test(decoded) || decoded.split('/').some(p => p === '.' || p === '..')) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}
