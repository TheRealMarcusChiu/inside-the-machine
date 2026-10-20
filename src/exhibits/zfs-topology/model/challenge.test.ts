import { describe, expect, it } from 'vitest';
import { checkMaxSurvive, checkMinLoss } from './challenge';
import type { PoolConfig } from './topology';

const pool: PoolConfig = { layout: 'raidz2', width: 6, vdevs: 2, diskSizeTB: 10 };

describe('challenge: survive the most failures', () => {
  it('is solved by the best-case count with the pool still alive', () => {
    expect(checkMaxSurvive(pool, [0, 1, 6, 7]).solved).toBe(true);
  });

  it('is not solved when the pool is lost, or too few disks failed', () => {
    expect(checkMaxSurvive(pool, [0, 1, 2, 6]).solved).toBe(false);
    expect(checkMaxSurvive(pool, [0, 1, 2, 6]).message).toMatch(/lost/i);
    expect(checkMaxSurvive(pool, [0, 6]).solved).toBe(false);
    expect(checkMaxSurvive(pool, [0, 6]).message).toMatch(/2 of 4/);
  });
});

describe('challenge: lose data with the fewest failures', () => {
  it('is solved by tolerance + 1 failures in one vdev', () => {
    expect(checkMinLoss(pool, [6, 7, 8]).solved).toBe(true);
  });

  it('is not solved by a survivable set or by more failures than needed', () => {
    expect(checkMinLoss(pool, [0, 6, 7]).solved).toBe(false);
    expect(checkMinLoss(pool, [0, 6, 7, 8]).solved).toBe(false);
    expect(checkMinLoss(pool, [0, 6, 7, 8]).message).toMatch(/fewer/i);
  });
});
