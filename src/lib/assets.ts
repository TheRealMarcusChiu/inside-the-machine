/**
 * Resolve a file in /public against Vite's base URL, so the same build works at
 * the domain root ("/") and under a GitHub Pages project subpath ("/repo/").
 * Never hard-code "/foo.svg" in components — use assetUrl("foo.svg").
 */
export function assetUrl(path: string, base: string = import.meta.env.BASE_URL): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(path)) return path;
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}${path.replace(/^\/+/, '')}`;
}
