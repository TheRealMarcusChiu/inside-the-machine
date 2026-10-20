import { LAYOUT_LABEL, tbToTiB, type PoolConfig } from './model/topology';

const trim = (n: number, digits: number) => String(Number(n.toFixed(digits)));

export const fmtTB = (tb: number) => `${trim(tb, 1)} TB`;
export const fmtTiB = (tb: number) => `${trim(tbToTiB(tb), 1)} TiB`;
export const fmtPercent = (f: number) => `${trim(f * 100, 1)}%`;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "2 × 6-wide RAIDZ2" or "3 × 2-way mirror". */
export function describeConfig(c: PoolConfig): string {
  return c.layout === 'mirror'
    ? `${c.vdevs} × ${c.width}-way mirror`
    : `${c.vdevs} × ${c.width}-wide ${LAYOUT_LABEL[c.layout]}`;
}

/** An illustrative `zpool create` line with placeholder device names. */
export function zpoolCreateCommand(c: PoolConfig): string {
  const groups = Array.from({ length: c.vdevs }, (_, v) => {
    const disks = Array.from({ length: c.width }, (_, p) => `d${v * c.width + p + 1}`);
    return `${c.layout} ${disks.join(' ')}`;
  });
  return `zpool create tank ${groups.join(' ')}`;
}
