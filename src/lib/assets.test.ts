import { describe, expect, it } from 'vitest';
import { assetUrl } from './assets';

describe('assetUrl', () => {
  it('prefixes public assets with the Vite base (GitHub Pages subpath)', () => {
    expect(assetUrl('favicon.svg', '/inside-the-machine/')).toBe('/inside-the-machine/favicon.svg');
    expect(assetUrl('/images/mark.svg', '/inside-the-machine/')).toBe('/inside-the-machine/images/mark.svg');
  });

  it('works at the domain root and with a base missing its trailing slash', () => {
    expect(assetUrl('favicon.svg', '/')).toBe('/favicon.svg');
    expect(assetUrl('favicon.svg', '/repo')).toBe('/repo/favicon.svg');
    expect(assetUrl('favicon.svg', './')).toBe('./favicon.svg');
  });

  it('defaults to import.meta.env.BASE_URL', () => {
    expect(assetUrl('x.svg')).toBe(`${import.meta.env.BASE_URL}x.svg`);
  });

  it('leaves absolute and data URLs untouched', () => {
    expect(assetUrl('data:image/svg+xml,<svg/>', '/r/')).toBe('data:image/svg+xml,<svg/>');
    expect(assetUrl('https://example.org/a.png', '/r/')).toBe('https://example.org/a.png');
  });
});
