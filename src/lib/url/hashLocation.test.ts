import { describe, expect, it } from 'vitest';
import { formatHash, parseHash } from './hashLocation';

describe('hash location', () => {
  it('parses path and query from a hash', () => {
    const loc = parseHash('#/exhibits/logic-to-cpu?a=5&depth=deep');
    expect(loc.path).toBe('/exhibits/logic-to-cpu');
    expect(loc.params.get('a')).toBe('5');
    expect(loc.params.get('depth')).toBe('deep');
  });

  it('treats an empty or bare hash as the home path', () => {
    expect(parseHash('').path).toBe('/');
    expect(parseHash('#').path).toBe('/');
    expect(parseHash('#/').path).toBe('/');
    expect(parseHash('#?motion=reduce').params.get('motion')).toBe('reduce');
  });

  it('normalises trailing slashes and missing leading slash', () => {
    expect(parseHash('#/exhibits/x/').path).toBe('/exhibits/x');
    expect(parseHash('#exhibits/x').path).toBe('/exhibits/x');
  });

  it('formats a hash and omits an empty query', () => {
    expect(formatHash('/exhibits/x', new URLSearchParams())).toBe('#/exhibits/x');
    expect(formatHash('/exhibits/x', new URLSearchParams('a=1'))).toBe('#/exhibits/x?a=1');
  });

  it('round-trips', () => {
    const hash = '#/exhibits/logic-to-cpu?gate=XOR&ga=1';
    const loc = parseHash(hash);
    expect(formatHash(loc.path, loc.params)).toBe(hash);
  });
});
