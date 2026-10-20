import { describe, expect, it } from 'vitest';
import { DEFAULT_K, DEFAULT_Q, DEFAULT_V } from './math';
import { DEFAULT_STATE, matrixCodec, parseEntry, readTinyState, writeTinyState } from './urlConfig';

describe('tiny transformer URL state', () => {
  it('defaults to the worked example and writes nothing for it', () => {
    expect(DEFAULT_STATE).toMatchObject({ depth: 'short', q: DEFAULT_Q, k: DEFAULT_K, v: DEFAULT_V, stage: 0, row: 0 });
    expect(writeTinyState(DEFAULT_STATE).toString()).toBe('');
  });

  it('round-trips edited matrices and controls', () => {
    const state = { ...DEFAULT_STATE, depth: 'deep' as const, q: [[3, 0, -1.5, 0], [0, 1, 0, 1], [1, 1, 0, 0]], stage: 3, row: 2 };
    const params = writeTinyState(state);
    expect(params.get('q')).toBe('3_0_-1.5_0*0_1_0_1*1_1_0_0');
    expect(readTinyState(new URLSearchParams(params.toString()))).toEqual(state);
  });

  it('falls back to defaults for invalid or tampered values', () => {
    const bad = new URLSearchParams(
      'q=1_2_3*4_5_6&k=NaN_0_0_0*0_0_0_0*0_0_0_0&v=1e3_0*0_1*0_0&stage=9&row=-1&depth=huge&guide=x',
    );
    const state = readTinyState(bad);
    expect(state).toEqual(DEFAULT_STATE);
  });

  it('rejects out-of-range, non-decimal and oversized entries', () => {
    const codec = matrixCodec(1, 2);
    expect(codec.parse('1_2')).toEqual([[1, 2]]);
    expect(codec.parse('11_0')).toBeUndefined();
    expect(codec.parse('Infinity_0')).toBeUndefined();
    expect(codec.parse('0x1_0')).toBeUndefined();
    expect(codec.parse('1__0')).toBeUndefined();
    expect(codec.parse('1'.repeat(500))).toBeUndefined();
  });

  it('parses typed entries, including a Unicode minus', () => {
    expect(parseEntry('−2.5')).toBe(-2.5);
    expect(parseEntry(' .5 ')).toBe(0.5);
    expect(parseEntry('')).toBeUndefined();
    expect(parseEntry('-')).toBeUndefined();
    expect(parseEntry('1e2')).toBeUndefined();
  });
});
