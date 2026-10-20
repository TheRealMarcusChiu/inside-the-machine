import { describe, expect, it } from 'vitest';
import {
  LAYOUTS,
  alternatives,
  bestCaseFailures,
  capacity,
  diskLocation,
  evaluatePool,
  normalizeConfig,
  parityOf,
  resiliency,
  survivalOdds,
  tbToTiB,
  totalDisks,
  vdevTolerance,
  vdevUsableTB,
  widthBounds,
  worstCaseFailures,
  type PoolConfig,
} from './topology';

const cfg = (layout: PoolConfig['layout'], width: number, vdevs: number, diskSizeTB = 10): PoolConfig => ({
  layout,
  width,
  vdevs,
  diskSizeTB,
});

describe('layouts and bounds', () => {
  it('offers mirrors and RAIDZ1/2/3', () => {
    expect(LAYOUTS).toEqual(['mirror', 'raidz1', 'raidz2', 'raidz3']);
  });

  it('RAIDZ parity is the level; mirrors have no parity', () => {
    expect(parityOf('raidz1')).toBe(1);
    expect(parityOf('raidz2')).toBe(2);
    expect(parityOf('raidz3')).toBe(3);
    expect(parityOf('mirror')).toBe(0);
  });

  it('a raidz group needs at least one more device than its parity; a mirror at least two', () => {
    expect(widthBounds('mirror').min).toBe(2);
    expect(widthBounds('raidz1').min).toBe(2);
    expect(widthBounds('raidz2').min).toBe(3);
    expect(widthBounds('raidz3').min).toBe(4);
  });

  it('normalizeConfig clamps width, vdev count and disk size into range', () => {
    expect(normalizeConfig(cfg('raidz3', 1, 0, 0))).toEqual(cfg('raidz3', 4, 1, 1));
    expect(normalizeConfig(cfg('mirror', 99, 99, 999))).toEqual(
      cfg('mirror', widthBounds('mirror').max, 8, 30),
    );
    expect(normalizeConfig(cfg('raidz2', 6.7, 2.2, 10.9))).toEqual(cfg('raidz2', 6, 2, 10));
  });
});

describe('capacity: raw is not estimated usable', () => {
  it('mirror of N disks of size X holds X per vdev (zpoolconcepts)', () => {
    for (const n of [2, 3, 4]) {
      expect(vdevUsableTB(cfg('mirror', n, 1, 8))).toBe(8);
      const c = capacity(cfg('mirror', n, 1, 8));
      expect(c.rawTB).toBe(8 * n);
      expect(c.estimatedUsableTB).toBe(8);
    }
  });

  it('raidz group of N disks with P parity holds approximately (N - P) * X', () => {
    expect(vdevUsableTB(cfg('raidz1', 5, 1, 4))).toBe(16);
    expect(vdevUsableTB(cfg('raidz2', 6, 1, 10))).toBe(40);
    expect(vdevUsableTB(cfg('raidz3', 9, 1, 12))).toBe(72);
  });

  it('multiple top-level vdevs add their usable space; redundancy is the rest of raw', () => {
    const c = capacity(cfg('raidz2', 6, 2, 10));
    expect(c.rawTB).toBe(120);
    expect(c.estimatedUsableTB).toBe(80);
    expect(c.redundancyTB).toBe(40);
    expect(c.efficiency).toBeCloseTo(2 / 3);
    expect(c.estimatedUsableTB).toBeLessThan(c.rawTB);
  });

  it('converts decimal TB to binary TiB', () => {
    expect(tbToTiB(1)).toBeCloseTo(0.9095, 4);
    expect(tbToTiB(0)).toBe(0);
  });
});

describe('disk numbering', () => {
  it('numbers disks vdev by vdev', () => {
    const c = cfg('raidz1', 3, 2);
    expect(totalDisks(c)).toBe(6);
    expect(diskLocation(c, 0)).toEqual({ vdev: 0, position: 0 });
    expect(diskLocation(c, 4)).toEqual({ vdev: 1, position: 1 });
  });
});

describe('resiliency depends on which disks fail', () => {
  it('per-vdev tolerance: mirror N-1, raidzP P', () => {
    expect(vdevTolerance(cfg('mirror', 2, 1))).toBe(1);
    expect(vdevTolerance(cfg('mirror', 3, 1))).toBe(2);
    expect(vdevTolerance(cfg('raidz1', 5, 1))).toBe(1);
    expect(vdevTolerance(cfg('raidz2', 6, 1))).toBe(2);
    expect(vdevTolerance(cfg('raidz3', 8, 1))).toBe(3);
  });

  it('summarises guaranteed, worst-case and best-case counts separately', () => {
    expect(resiliency(cfg('raidz2', 6, 2))).toEqual({
      perVdevTolerance: 2,
      guaranteedSurvivable: 2,
      fewestFailuresThatCanLoseData: 3,
      mostFailuresThatCanBeSurvived: 4,
    });
    expect(resiliency(cfg('mirror', 2, 4))).toEqual({
      perVdevTolerance: 1,
      guaranteedSurvivable: 1,
      fewestFailuresThatCanLoseData: 2,
      mostFailuresThatCanBeSurvived: 4,
    });
  });

  it('with one vdev, guaranteed and best case coincide', () => {
    const r = resiliency(cfg('raidz3', 8, 1));
    expect(r.guaranteedSurvivable).toBe(3);
    expect(r.mostFailuresThatCanBeSurvived).toBe(3);
  });

  it('the same number of failures can be survived or fatal depending on placement', () => {
    const c = cfg('raidz2', 6, 2);
    // Three failures spread 2 + 1: pool survives, degraded.
    expect(evaluatePool(c, [0, 1, 6]).state).toBe('DEGRADED');
    // Three failures all in vdev 0: that vdev is lost, and with it the pool.
    const lost = evaluatePool(c, [0, 1, 2]);
    expect(lost.state).toBe('FAULTED');
    expect(lost.dataLoss).toBe(true);
    expect(lost.vdevs[0]!.state).toBe('FAULTED');
    expect(lost.vdevs[1]!.state).toBe('ONLINE');
  });

  it('reports per-vdev margin and state', () => {
    const h = evaluatePool(cfg('mirror', 3, 2), [1, 3, 4]);
    expect(h.state).toBe('DEGRADED');
    expect(h.dataLoss).toBe(false);
    expect(h.failedCount).toBe(3);
    expect(h.vdevs.map((v) => [v.failedCount, v.margin, v.state])).toEqual([
      [1, 1, 'DEGRADED'],
      [2, 0, 'DEGRADED'],
    ]);
  });

  it('no failures means ONLINE; duplicates and out-of-range indices are ignored', () => {
    const c = cfg('raidz1', 4, 1);
    expect(evaluatePool(c, []).state).toBe('ONLINE');
    expect(evaluatePool(c, [2, 2, 99, -1]).failedCount).toBe(1);
  });

  it('a 2-way mirror pool dies when both halves of one mirror fail, not when one of each fails', () => {
    const c = cfg('mirror', 2, 3);
    expect(evaluatePool(c, [0, 2, 4]).state).toBe('DEGRADED');
    expect(evaluatePool(c, [2, 3]).state).toBe('FAULTED');
  });
});

describe('placements', () => {
  it('bestCaseFailures spreads failures round-robin across vdevs', () => {
    const c = cfg('raidz2', 6, 2);
    const order = bestCaseFailures(c, 4);
    expect(order).toHaveLength(4);
    expect(evaluatePool(c, order).state).toBe('DEGRADED');
    expect(order.map((d) => diskLocation(c, d).vdev).sort()).toEqual([0, 0, 1, 1]);
    expect(bestCaseFailures(c, 99)).toHaveLength(12);
  });

  it('worstCaseFailures loses the pool with the fewest possible failures', () => {
    for (const c of [cfg('raidz2', 6, 2), cfg('mirror', 3, 3), cfg('raidz1', 2, 1), cfg('raidz3', 4, 2)]) {
      const order = worstCaseFailures(c);
      expect(order).toHaveLength(resiliency(c).fewestFailuresThatCanLoseData);
      expect(evaluatePool(c, order).state).toBe('FAULTED');
      expect(evaluatePool(c, order.slice(0, -1)).state).not.toBe('FAULTED');
    }
  });
});

describe('survivalOdds: exact counts over every set of k failed disks', () => {
  it('matches hand counts for two 2-way mirrors', () => {
    // 4 disks, C(4,2)=6 pairs; only {0,1} and {2,3} are fatal.
    const odds = survivalOdds(cfg('mirror', 2, 2), 2);
    expect(odds.survivingSets).toBe(4n);
    expect(odds.totalSets).toBe(6n);
    expect(odds.fraction).toBeCloseTo(4 / 6);
  });

  it('is 1 up to the guaranteed count and 0 beyond the best case', () => {
    const c = cfg('raidz2', 6, 2);
    expect(survivalOdds(c, 0).fraction).toBe(1);
    expect(survivalOdds(c, 2).fraction).toBe(1);
    expect(survivalOdds(c, 3).fraction).toBeGreaterThan(0);
    expect(survivalOdds(c, 3).fraction).toBeLessThan(1);
    expect(survivalOdds(c, 5).fraction).toBe(0);
  });

  it('agrees with brute force enumeration', () => {
    const c = cfg('raidz1', 3, 3);
    const n = totalDisks(c);
    for (let k = 0; k <= n; k++) {
      let survive = 0;
      let total = 0;
      for (let mask = 0; mask < 1 << n; mask++) {
        const set = [...Array(n).keys()].filter((i) => mask & (1 << i));
        if (set.length !== k) continue;
        total++;
        if (evaluatePool(c, set).state !== 'FAULTED') survive++;
      }
      const odds = survivalOdds(c, k);
      expect(odds.survivingSets).toBe(BigInt(survive));
      expect(odds.totalSets).toBe(BigInt(total));
    }
  });

  it('stays exact for the largest pools', () => {
    const c = normalizeConfig(cfg('raidz1', 99, 99));
    const odds = survivalOdds(c, Math.floor(totalDisks(c) / 2));
    expect(odds.totalSets > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(odds.fraction).toBeGreaterThanOrEqual(0);
    expect(odds.fraction).toBeLessThanOrEqual(1);
  });
});

describe('alternatives for the same disks', () => {
  it('lists every layout whose vdevs exactly use the given disk count', () => {
    const alts = alternatives(12, 10);
    expect(alts.length).toBeGreaterThan(3);
    for (const a of alts) {
      expect(totalDisks(a.config)).toBe(12);
      expect(a.capacity.rawTB).toBe(120);
    }
    const twoWay = alts.find((a) => a.config.layout === 'mirror' && a.config.width === 2)!;
    expect(twoWay.config.vdevs).toBe(6);
    expect(twoWay.capacity.estimatedUsableTB).toBe(60);
    expect(alts.some((a) => a.config.layout === 'raidz2' && a.config.width === 6 && a.config.vdevs === 2)).toBe(true);
  });

  it('is sorted by estimated usable space, largest first', () => {
    const usable = alternatives(12, 10).map((a) => a.capacity.estimatedUsableTB);
    expect([...usable].sort((a, b) => b - a)).toEqual(usable);
  });
});
