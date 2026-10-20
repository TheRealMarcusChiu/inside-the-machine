/**
 * A deliberately simplified picture of how RAIDZ places blocks. Each block is its own variable-width stripe:
 * every row of up to N - P data sectors gets P parity sectors, and the allocation is padded to a multiple of
 * P + 1 sectors. Blocks are packed one after another, so where a block starts — and therefore which disks hold
 * its parity — keeps moving. Real RAIDZ maps a block column-wise from its allocation offset (vdev_raidz.c);
 * this keeps only the properties the exhibit teaches: parity is distributed, and no disk is the parity disk.
 */

export type CellKind = 'data' | 'parity' | 'skip' | 'empty';

export interface Cell {
  kind: CellKind;
  /** Index of the block this sector belongs to; null for empty cells. */
  block: number | null;
  disk: number;
}

export interface BlockPlacement {
  index: number;
  dataSectors: number;
  paritySectors: number;
  skipSectors: number;
  parityDisks: number[];
  /** Each row of the block: its parity sectors followed by its data sectors, on distinct disks. */
  stripes: Cell[][];
}

export interface RaidzLayout {
  /** The grid: one row per sector offset, one column per disk. */
  rows: Cell[][];
  blocks: BlockPlacement[];
}

/** Block sizes, in sectors, written by the explanatory animation. */
export const DEMO_BLOCKS: readonly number[] = [3, 1, 6, 2, 5];

export function layoutBlocks(width: number, parity: number, blockSectors: readonly number[]): RaidzLayout {
  const cells: Cell[] = [];
  const place = (kind: CellKind, block: number): Cell => {
    const cell = { kind, block, disk: cells.length % width };
    cells.push(cell);
    return cell;
  };

  const blocks = blockSectors.map((dataSectors, index): BlockPlacement => {
    const perRow = width - parity;
    const stripes: Cell[][] = [];
    for (let left = dataSectors; left > 0; left -= perRow) {
      const stripe: Cell[] = [];
      for (let p = 0; p < parity; p++) stripe.push(place('parity', index));
      for (let d = 0; d < Math.min(perRow, left); d++) stripe.push(place('data', index));
      stripes.push(stripe);
    }
    const paritySectors = stripes.length * parity;
    const used = dataSectors + paritySectors;
    const skipSectors = Math.ceil(used / (parity + 1)) * (parity + 1) - used;
    for (let s = 0; s < skipSectors; s++) place('skip', index);
    const parityDisks = stripes.flatMap((st) => st.filter((c) => c.kind === 'parity').map((c) => c.disk));
    return { index, dataSectors, paritySectors, skipSectors, parityDisks, stripes };
  });

  const rows: Cell[][] = [];
  for (let i = 0; i < cells.length; i += width) {
    const row = cells.slice(i, i + width);
    while (row.length < width) row.push({ kind: 'empty', block: null, disk: row.length });
    rows.push(row);
  }
  return { rows, blocks };
}
