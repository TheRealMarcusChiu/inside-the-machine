/**
 * Routing lives in the URL hash ("#/exhibits/slug?a=1") so the static build
 * works on GitHub Pages without server rewrites, under any base path.
 */
export interface HashLocation {
  path: string;
  params: URLSearchParams;
}

export function normalisePath(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}` : '/';
}

export function parseHash(hash: string): HashLocation {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = raw.indexOf('?');
  const path = q === -1 ? raw : raw.slice(0, q);
  const query = q === -1 ? '' : raw.slice(q + 1);
  return { path: normalisePath(path), params: new URLSearchParams(query) };
}

export function formatHash(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return `#${normalisePath(path)}${query ? `?${query}` : ''}`;
}
