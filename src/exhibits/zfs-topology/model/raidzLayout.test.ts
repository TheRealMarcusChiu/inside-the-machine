import { describe, expect, it } from 'vitest';
import { DEMO_BLOCKS, layoutBlocks } from './raidzLayout';

describe('layoutBlocks: a simplified picture of RAIDZ distributed parity', () => {
  it('gives each block P parity sectors per row of up to N - P data sectors', () => {
    const { blocks } = layoutBlocks(5, 1, [3, 1, 5, 9]);
    expect(blocks.map((b) => b.paritySectors)).toEqual([1, 1, 2, 3]);
    const { blocks: z2 } = layoutBlocks(6, 2, [4, 5]);
    expect(z2.map((b) => b.paritySectors)).toEqual([2, 4]);
  });

  it('pads each allocation to a multiple of P + 1 sectors', () => {
    for (const [n, p] of [
      [5, 1],
      [6, 2],
      [7, 3],
    ] as const) {
      const { blocks } = layoutBlocks(n, p, DEMO_BLOCKS);
      for (const b of blocks) expect((b.dataSectors + b.paritySectors + b.skipSectors) % (p + 1)).toBe(0);
    }
  });

  it('places parity on different disks for different blocks — there is no dedicated parity disk', () => {
    for (const [n, p] of [
      [4, 1],
      [5, 1],
      [6, 2],
      [8, 3],
    ] as const) {
      const { blocks } = layoutBlocks(n, p, DEMO_BLOCKS);
      const parityDisks = new Set(blocks.flatMap((b) => b.parityDisks));
      expect(parityDisks.size).toBeGreaterThan(p);
    }
  });

  it('never puts two sectors of the same block row on one disk', () => {
    const { rows } = layoutBlocks(5, 2, DEMO_BLOCKS);
    for (const row of rows) expect(row).toHaveLength(5);
    const { blocks } = layoutBlocks(5, 2, DEMO_BLOCKS);
    for (const b of blocks) {
      for (const stripe of b.stripes) expect(new Set(stripe.map((c) => c.disk)).size).toBe(stripe.length);
    }
  });

  it('counts every sector in the grid', () => {
    const { rows, blocks } = layoutBlocks(5, 1, [3, 1, 5]);
    const used = rows.flat().filter((c) => c.kind !== 'empty').length;
    expect(used).toBe(blocks.reduce((s, b) => s + b.dataSectors + b.paritySectors + b.skipSectors, 0));
  });
});
