import { describe, expect, it } from 'vitest';
import { DEFAULT_ZFS_STATE, applyPatch, readZfsState, writeZfsState } from './urlConfig';

const p = (q: string) => new URLSearchParams(q);

describe('ZFS exhibit URL state', () => {
  it('defaults to the worked example: two 6-wide RAIDZ2 vdevs of 10 TB disks, nothing failed', () => {
    expect(DEFAULT_ZFS_STATE).toEqual({
      depth: 'short',
      layout: 'raidz2',
      width: 6,
      vdevs: 2,
      diskSizeTB: 10,
      failed: [],
    });
    expect(writeZfsState(DEFAULT_ZFS_STATE).toString()).toBe('');
  });

  it('round-trips a shared configuration including failure order', () => {
    const state = { ...DEFAULT_ZFS_STATE, layout: 'mirror' as const, width: 3, vdevs: 4, diskSizeTB: 18, failed: [5, 0, 7] };
    const params = writeZfsState(state);
    expect(params.get('fail')).toBe('5.0.7');
    expect(readZfsState(params)).toEqual(state);
  });

  it('falls back to defaults on tampered values', () => {
    expect(readZfsState(p('lay=raid5&w=abc&v=-2&tb=9999&fail=x&depth=huge'))).toEqual(DEFAULT_ZFS_STATE);
  });

  it('clamps width to what the layout allows', () => {
    expect(readZfsState(p('lay=raidz3&w=2')).width).toBe(4);
    expect(readZfsState(p('lay=mirror&w=12')).width).toBe(6);
  });

  it('drops failed disks that do not exist in the pool and duplicates', () => {
    expect(readZfsState(p('lay=mirror&w=2&v=2&fail=3.3.9.1')).failed).toEqual([3, 1]);
  });

  it('keeps unrelated params when writing', () => {
    expect(writeZfsState({ ...DEFAULT_ZFS_STATE, vdevs: 3 }, p('at=sources')).toString()).toBe('at=sources&v=3');
  });

  it('applyPatch clears failures when the geometry changes, and keeps them otherwise', () => {
    const s = { ...DEFAULT_ZFS_STATE, failed: [1, 2] };
    expect(applyPatch(s, { vdevs: 3 }).failed).toEqual([]);
    expect(applyPatch(s, { layout: 'raidz3' }).failed).toEqual([]);
    expect(applyPatch(s, { diskSizeTB: 4 }).failed).toEqual([1, 2]);
    expect(applyPatch(s, { depth: 'deep' }).failed).toEqual([1, 2]);
  });

  it('applyPatch keeps the width valid when switching layouts', () => {
    expect(applyPatch({ ...DEFAULT_ZFS_STATE, layout: 'raidz1', width: 2 }, { layout: 'raidz3' }).width).toBe(4);
    expect(applyPatch({ ...DEFAULT_ZFS_STATE, width: 10 }, { layout: 'mirror' }).width).toBe(6);
  });
});
