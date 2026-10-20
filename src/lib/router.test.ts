import { describe, expect, it } from 'vitest';
import { exhibitPath, resolveRoute } from './router';
import type { ExhibitEntry } from '../exhibits/types';

const registry: ExhibitEntry[] = [
  {
    status: 'open',
    slug: 'open-one',
    number: 1,
    title: 'Open',
    subtitle: '',
    summary: '',
    topics: [],
    load: async () => ({ default: () => null }),
  },
  { status: 'planned', slug: 'later', number: 2, title: 'Later', subtitle: '', summary: '', topics: [] },
];

describe('router', () => {
  it('resolves home', () => {
    expect(resolveRoute('/', registry)).toEqual({ kind: 'home' });
  });

  it('resolves open exhibits only', () => {
    const route = resolveRoute('/exhibits/open-one', registry);
    expect(route.kind).toBe('exhibit');
    if (route.kind === 'exhibit') expect(route.exhibit.slug).toBe('open-one');
  });

  it('never routes to planned exhibits — they have no page', () => {
    expect(resolveRoute('/exhibits/later', registry)).toEqual({ kind: 'not-found', path: '/exhibits/later' });
  });

  it('returns not-found for unknown paths', () => {
    expect(resolveRoute('/nope', registry).kind).toBe('not-found');
    expect(resolveRoute('/exhibits/', registry).kind).toBe('not-found');
  });

  it('builds exhibit paths', () => {
    expect(exhibitPath('open-one')).toBe('/exhibits/open-one');
  });
});
