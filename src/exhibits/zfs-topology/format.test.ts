import { describe, expect, it } from 'vitest';
import { describeConfig, fmtPercent, fmtTB, fmtTiB, plural, zpoolCreateCommand } from './format';

describe('formatting', () => {
  it('formats decimal and binary units', () => {
    expect(fmtTB(80)).toBe('80 TB');
    expect(fmtTB(2.25)).toBe('2.3 TB');
    expect(fmtTiB(80)).toBe('72.8 TiB');
    expect(fmtPercent(2 / 3)).toBe('66.7%');
    expect(plural(1, 'disk')).toBe('1 disk');
    expect(plural(3, 'disk')).toBe('3 disks');
  });

  it('describes configurations', () => {
    expect(describeConfig({ layout: 'raidz2', width: 6, vdevs: 2, diskSizeTB: 10 })).toBe('2 × 6-wide RAIDZ2');
    expect(describeConfig({ layout: 'mirror', width: 2, vdevs: 3, diskSizeTB: 10 })).toBe('3 × 2-way mirror');
  });

  it('builds an illustrative zpool create line with one group per top-level vdev', () => {
    expect(zpoolCreateCommand({ layout: 'mirror', width: 2, vdevs: 2, diskSizeTB: 1 })).toBe(
      'zpool create tank mirror d1 d2 mirror d3 d4',
    );
  });
});
