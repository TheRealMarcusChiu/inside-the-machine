import { describe, expect, it } from 'vitest';
import { EXHIBITS, getOpenExhibits, getPlannedExhibits } from './registry';

describe('exhibit registry', () => {
  it('has unique, URL-safe slugs and unique gallery numbers', () => {
    const slugs = EXHIBITS.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    const numbers = EXHIBITS.map((e) => e.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('opens exactly the seven complete exhibits, in gallery order, as Rooms 1–7', () => {
    expect(EXHIBITS.map((e) => [e.number, e.slug, e.status])).toEqual([
      [1, 'logic-to-cpu', 'open'],
      [2, 'memory-hierarchy', 'open'],
      [3, 'cpu-vs-gpu', 'open'],
      [4, 'tiny-transformer', 'open'],
      [5, 'llm-bottleneck', 'open'],
      [6, 'web-request', 'open'],
      [7, 'zfs-topology', 'open'],
    ]);
    const open = getOpenExhibits();
    expect(open).toHaveLength(7);
    for (const e of open) expect(typeof e.load).toBe('function');
  });

  it('has no planned (unbuilt) exhibits left in the gallery', () => {
    expect(getPlannedExhibits()).toEqual([]);
    const slugs = EXHIBITS.map((e) => e.slug);
    expect(slugs).not.toContain('floating-point');
    expect(slugs).not.toContain('compilers');
  });

  it('lists exhibits in gallery order', () => {
    const numbers = EXHIBITS.map((e) => e.number);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });

  it('lazy-loads each open exhibit module', async () => {
    for (const e of getOpenExhibits()) {
      const mod = await e.load();
      expect(typeof mod.default).toBe('function');
    }
  });
});
