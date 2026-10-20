import type { ExhibitEntry, OpenExhibit } from '../exhibits/types';

export type Route =
  | { kind: 'home' }
  | { kind: 'exhibit'; exhibit: OpenExhibit }
  | { kind: 'not-found'; path: string };

const EXHIBIT_PREFIX = '/exhibits/';

export function exhibitPath(slug: string): string {
  return `${EXHIBIT_PREFIX}${slug}`;
}

/** Only exhibits with status "open" are routable; planned ones have no page at all. */
export function resolveRoute(path: string, registry: readonly ExhibitEntry[]): Route {
  if (path === '/') return { kind: 'home' };
  if (path.startsWith(EXHIBIT_PREFIX)) {
    const slug = path.slice(EXHIBIT_PREFIX.length);
    const exhibit = registry.find((e): e is OpenExhibit => e.status === 'open' && e.slug === slug);
    if (exhibit) return { kind: 'exhibit', exhibit };
  }
  return { kind: 'not-found', path };
}
