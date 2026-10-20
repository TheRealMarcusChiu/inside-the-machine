/**
 * Pure geometry model of a ZFS pool built from equal disks: one layout (mirror or RAIDZ1/2/3) repeated across
 * one or more top-level vdevs. Capacity follows the rules of thumb in OpenZFS zpoolconcepts(7):
 *   - "A mirror of N disks of size X can hold X bytes and can withstand N-1 devices failing."
 *   - "A raidz group with N disks of size X with P parity disks can hold approximately (N-P)*X bytes and can
 *     withstand P devices failing without losing data."
 * This is a geometry estimate, not a prediction of what `zpool list` or `zfs list` will report.
 */

export const LAYOUTS = ['mirror', 'raidz1', 'raidz2', 'raidz3'] as const;
export type Layout = (typeof LAYOUTS)[number];

export const LAYOUT_LABEL: Record<Layout, string> = {
  mirror: 'Mirror',
  raidz1: 'RAIDZ1',
  raidz2: 'RAIDZ2',
  raidz3: 'RAIDZ3',
};

export interface PoolConfig {
  layout: Layout;
  /** Disks in each top-level vdev. */
  width: number;
  /** Number of top-level vdevs; every vdev has the same layout and width. */
  vdevs: number;
  /** Size of every disk, in decimal terabytes (10^12 bytes). */
  diskSizeTB: number;
}

export const LIMITS = {
  vdevs: { min: 1, max: 8 },
  diskSizeTB: { min: 1, max: 30 },
} as const;

const MIRROR_MAX_WIDTH = 6;
const RAIDZ_MAX_WIDTH = 12;

export function parityOf(layout: Layout): number {
  return layout === 'mirror' ? 0 : Number(layout.slice(-1));
}

/** A mirror needs two disks; a raidz group needs one more device than its parity (zpoolconcepts). */
export function widthBounds(layout: Layout): { min: number; max: number } {
  return layout === 'mirror'
    ? { min: 2, max: MIRROR_MAX_WIDTH }
    : { min: parityOf(layout) + 1, max: RAIDZ_MAX_WIDTH };
}

const clampInt = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? Math.trunc(n) : min));

export function normalizeConfig(c: PoolConfig): PoolConfig {
  const w = widthBounds(c.layout);
  return {
    layout: c.layout,
    width: clampInt(c.width, w.min, w.max),
    vdevs: clampInt(c.vdevs, LIMITS.vdevs.min, LIMITS.vdevs.max),
    diskSizeTB: clampInt(c.diskSizeTB, LIMITS.diskSizeTB.min, LIMITS.diskSizeTB.max),
  };
}

export const totalDisks = (c: PoolConfig) => c.width * c.vdevs;

/** Disks are numbered vdev by vdev: disk i lives in vdev floor(i / width). */
export function diskLocation(c: PoolConfig, index: number): { vdev: number; position: number } {
  return { vdev: Math.floor(index / c.width), position: index % c.width };
}

/** How many disks one vdev can lose without losing data. */
export function vdevTolerance(c: PoolConfig): number {
  return c.layout === 'mirror' ? c.width - 1 : parityOf(c.layout);
}

/** Estimated usable space of one vdev, in TB. */
export function vdevUsableTB(c: PoolConfig): number {
  return c.layout === 'mirror' ? c.diskSizeTB : (c.width - parityOf(c.layout)) * c.diskSizeTB;
}

export interface Capacity {
  /** Sum of every disk's size: what was bought. */
  rawTB: number;
  /** Geometry estimate of space for data, before any real-world overhead. */
  estimatedUsableTB: number;
  /** Raw space spent on parity or mirror copies. */
  redundancyTB: number;
  /** estimatedUsable / raw. */
  efficiency: number;
}

export function capacity(c: PoolConfig): Capacity {
  const rawTB = totalDisks(c) * c.diskSizeTB;
  const estimatedUsableTB = c.vdevs * vdevUsableTB(c);
  return { rawTB, estimatedUsableTB, redundancyTB: rawTB - estimatedUsableTB, efficiency: estimatedUsableTB / rawTB };
}

export const BYTES_PER_TB = 1e12;
export const BYTES_PER_TIB = 2 ** 40;
export const tbToTiB = (tb: number) => (tb * BYTES_PER_TB) / BYTES_PER_TIB;

export type HealthState = 'ONLINE' | 'DEGRADED' | 'FAULTED';

export interface VdevHealth {
  index: number;
  /** Global indices of this vdev's failed disks. */
  failed: number[];
  failedCount: number;
  tolerance: number;
  /** Further failures this vdev can absorb; negative once it has failed. */
  margin: number;
  state: HealthState;
}

export interface PoolHealth {
  state: HealthState;
  vdevs: VdevHealth[];
  failedCount: number;
  /** True once any top-level vdev has failed: the pool's data is striped across all of them. */
  dataLoss: boolean;
}

/** Keep only real, distinct disk indices, in their original order. */
export function cleanFailures(c: PoolConfig, failed: readonly number[]): number[] {
  const n = totalDisks(c);
  const seen = new Set<number>();
  for (const d of failed) if (Number.isInteger(d) && d >= 0 && d < n) seen.add(d);
  return [...seen];
}

export function evaluatePool(c: PoolConfig, failed: readonly number[]): PoolHealth {
  const clean = cleanFailures(c, failed);
  const tolerance = vdevTolerance(c);
  const vdevs: VdevHealth[] = Array.from({ length: c.vdevs }, (_, index) => {
    const mine = clean.filter((d) => diskLocation(c, d).vdev === index);
    const margin = tolerance - mine.length;
    return {
      index,
      failed: mine,
      failedCount: mine.length,
      tolerance,
      margin,
      state: mine.length === 0 ? 'ONLINE' : margin >= 0 ? 'DEGRADED' : 'FAULTED',
    };
  });
  const dataLoss = vdevs.some((v) => v.state === 'FAULTED');
  return {
    state: dataLoss ? 'FAULTED' : clean.length > 0 ? 'DEGRADED' : 'ONLINE',
    vdevs,
    failedCount: clean.length,
    dataLoss,
  };
}

export interface Resiliency {
  perVdevTolerance: number;
  /** Any set of this many failed disks is survivable, wherever they are. */
  guaranteedSurvivable: number;
  /** This many failures, all in one vdev, lose the pool. */
  fewestFailuresThatCanLoseData: number;
  /** The most failures the pool can survive, only if they are spread perfectly across vdevs. */
  mostFailuresThatCanBeSurvived: number;
}

export function resiliency(c: PoolConfig): Resiliency {
  const t = vdevTolerance(c);
  return {
    perVdevTolerance: t,
    guaranteedSurvivable: t,
    fewestFailuresThatCanLoseData: t + 1,
    mostFailuresThatCanBeSurvived: t * c.vdevs,
  };
}

/** k failures placed round-robin across vdevs: the most survivable placement. */
export function bestCaseFailures(c: PoolConfig, k: number): number[] {
  const n = Math.min(Math.max(0, k), totalDisks(c));
  return Array.from({ length: n }, (_, i) => (i % c.vdevs) * c.width + Math.floor(i / c.vdevs));
}

/** The fewest failures that lose the pool: one more than the tolerance, all in the first vdev. */
export function worstCaseFailures(c: PoolConfig): number[] {
  return Array.from({ length: vdevTolerance(c) + 1 }, (_, i) => i);
}

function binomial(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n;
  let r = 1n;
  for (let i = 1; i <= k; i++) r = (r * BigInt(n - k + i)) / BigInt(i);
  return r;
}

export interface SurvivalOdds {
  survivingSets: bigint;
  totalSets: bigint;
  fraction: number;
}

/**
 * Of all C(disks, k) ways that exactly k disks can fail, how many leave every vdev within its tolerance?
 * Counted exactly by multiplying per-vdev generating polynomials sum_{j<=t} C(width, j) x^j.
 * This is combinatorics over failure placements, not a reliability (MTTDL) or probability-of-failure model.
 */
export function survivalOdds(c: PoolConfig, k: number): SurvivalOdds {
  const t = vdevTolerance(c);
  const perVdev = Array.from({ length: t + 1 }, (_, j) => binomial(c.width, j));
  let poly: bigint[] = [1n];
  for (let v = 0; v < c.vdevs; v++) {
    const next: bigint[] = Array(poly.length + t).fill(0n);
    poly.forEach((a, i) => perVdev.forEach((b, j) => (next[i + j] = next[i + j]! + a * b)));
    poly = next;
  }
  const survivingSets = poly[k] ?? 0n;
  const totalSets = binomial(totalDisks(c), k);
  const SCALE = 1_000_000_000n;
  const fraction = totalSets === 0n ? 0 : Number((survivingSets * SCALE) / totalSets) / Number(SCALE);
  return { survivingSets, totalSets, fraction };
}

export interface Alternative {
  config: PoolConfig;
  capacity: Capacity;
  resiliency: Resiliency;
}

/** Every supported layout that uses exactly `disks` disks of the given size, largest usable first. */
export function alternatives(disks: number, diskSizeTB: number): Alternative[] {
  const out: Alternative[] = [];
  for (const layout of LAYOUTS) {
    const { min, max } = widthBounds(layout);
    for (let width = min; width <= max; width++) {
      const vdevs = disks / width;
      if (!Number.isInteger(vdevs) || vdevs < LIMITS.vdevs.min || vdevs > LIMITS.vdevs.max) continue;
      const config = { layout, width, vdevs, diskSizeTB };
      out.push({ config, capacity: capacity(config), resiliency: resiliency(config) });
    }
  }
  return out.sort(
    (a, b) =>
      b.capacity.estimatedUsableTB - a.capacity.estimatedUsableTB ||
      b.resiliency.guaranteedSurvivable - a.resiliency.guaranteedSurvivable,
  );
}
