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

  it('opens the complete exhibits: logic gates → adder → CPU, the memory hierarchy, the tiny transformer, CPU vs GPU, the web request journey, the ZFS topology explorer, then the LLM bottleneck explorer', () => {
    const open = getOpenExhibits();
    expect(open.map((e) => e.slug)).toEqual([
      'logic-to-cpu',
      'memory-hierarchy',
      'tiny-transformer',
      'cpu-vs-gpu',
      'web-request',
      'zfs-topology',
      'llm-bottleneck',
    ]);
    for (const e of open) expect(typeof e.load).toBe('function');
  });

  it('planned exhibits carry no page loader (no placeholder routes)', () => {
    const planned = getPlannedExhibits();
    expect(planned.length).toBeGreaterThan(0);
    for (const e of planned) expect('load' in e).toBe(false);
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
