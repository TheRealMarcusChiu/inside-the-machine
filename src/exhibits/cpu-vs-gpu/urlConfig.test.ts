import { describe, expect, it } from 'vitest';
import { DEFAULT_EXHIBIT_STATE, WARP_WIDTHS, readExhibitState, writeExhibitState } from './urlConfig';

describe('cpu-vs-gpu URL configuration', () => {
  it('uses the worked example as the default configuration', () => {
    expect(DEFAULT_EXHIBIT_STATE).toEqual({
      depth: 'short',
      lanes: 16,
      warpWidth: 8,
      divergence: 1,
      regularity: 'regular',
      transfer: false,
    });
    expect(readExhibitState(new URLSearchParams())).toEqual(DEFAULT_EXHIBIT_STATE);
  });

  it('offers power-of-two warp widths up to 32', () => {
    expect(WARP_WIDTHS).toEqual([4, 8, 16, 32]);
  });

  it('restores a shared configuration', () => {
    const s = readExhibitState(new URLSearchParams('depth=deep&lanes=64&warp=32&div=3&access=irregular&xfer=1'));
    expect(s).toEqual({
      depth: 'deep',
      lanes: 64,
      warpWidth: 32,
      divergence: 3,
      regularity: 'irregular',
      transfer: true,
    });
  });

  it.each([
    ['lanes=0', 'lanes'],
    ['lanes=65', 'lanes'],
    ['lanes=1e3', 'lanes'],
    ['lanes=-4', 'lanes'],
    ['lanes=', 'lanes'],
    ['warp=12', 'warpWidth'],
    ['warp=64', 'warpWidth'],
    ['warp=eight', 'warpWidth'],
    ['div=0', 'divergence'],
    ['div=5', 'divergence'],
    ['div=2.5', 'divergence'],
    ['access=random', 'regularity'],
    ['access=REGULAR', 'regularity'],
    ['xfer=yes', 'transfer'],
    ['xfer=true', 'transfer'],
    ['depth=extreme', 'depth'],
  ] as const)('falls back to the default for tampered %s', (query, field) => {
    expect(readExhibitState(new URLSearchParams(query))[field]).toEqual(DEFAULT_EXHIBIT_STATE[field]);
  });

  it('keeps valid fields when others are tampered', () => {
    const s = readExhibitState(new URLSearchParams('lanes=<script>&warp=16&div=99&access=irregular'));
    expect(s.lanes).toBe(DEFAULT_EXHIBIT_STATE.lanes);
    expect(s.warpWidth).toBe(16);
    expect(s.divergence).toBe(DEFAULT_EXHIBIT_STATE.divergence);
    expect(s.regularity).toBe('irregular');
  });

  it('writes nothing for the default state', () => {
    expect(writeExhibitState(DEFAULT_EXHIBIT_STATE).toString()).toBe('');
  });

  it('writes only the fields that differ from the defaults', () => {
    const params = writeExhibitState({ ...DEFAULT_EXHIBIT_STATE, warpWidth: 32, transfer: true });
    expect([...params.keys()].sort()).toEqual(['warp', 'xfer']);
    expect(params.get('warp')).toBe('32');
    expect(params.get('xfer')).toBe('1');
  });

  it('round-trips every field through a shareable URL and keeps unrelated params', () => {
    const state = {
      depth: 'deep',
      lanes: 40,
      warpWidth: 4,
      divergence: 4,
      regularity: 'irregular',
      transfer: true,
    } as const;
    const params = writeExhibitState(state, new URLSearchParams('motion=reduce&at=sources'));
    expect(params.get('motion')).toBe('reduce');
    expect(params.get('at')).toBe('sources');
    expect(readExhibitState(new URLSearchParams(params.toString()))).toEqual(state);
  });

  it('removes a field from the URL when it returns to its default', () => {
    const shared = writeExhibitState({ ...DEFAULT_EXHIBIT_STATE, divergence: 2 });
    expect(shared.get('div')).toBe('2');
    const back = writeExhibitState(DEFAULT_EXHIBIT_STATE, shared);
    expect(back.has('div')).toBe(false);
  });
});
