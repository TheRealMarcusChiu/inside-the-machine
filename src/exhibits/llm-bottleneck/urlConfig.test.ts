import { describe, expect, it } from 'vitest';
import { WORKED_EXAMPLE } from './model/bottleneck';
import {
  DEFAULT_LLM_STATE,
  LIMITS,
  parseFieldInput,
  readLlmState,
  scaleField,
  toConfig,
  writeLlmState,
} from './urlConfig';

describe('llm-bottleneck URL configuration', () => {
  it('defaults to the worked example, decode phase, short explanations', () => {
    expect(DEFAULT_LLM_STATE.depth).toBe('short');
    expect(DEFAULT_LLM_STATE.phase).toBe('decode');
    expect(toConfig(DEFAULT_LLM_STATE)).toEqual(WORKED_EXAMPLE);
    expect(readLlmState(new URLSearchParams())).toEqual(DEFAULT_LLM_STATE);
  });

  it('writes nothing for the default state', () => {
    expect(writeLlmState(DEFAULT_LLM_STATE).toString()).toBe('');
  });

  it('round-trips every parameter, including decimals', () => {
    const state = {
      ...DEFAULT_LLM_STATE,
      depth: 'deep' as const,
      phase: 'prefill' as const,
      paramsB: 70.6,
      bytesPerParam: 0.5,
      layers: 80,
      heads: 64,
      kvHeads: 8,
      headDim: 128,
      context: 131072,
      batch: 16,
      peakTflops: 989.5,
      bandwidthTBs: 3.35,
    };
    const params = writeLlmState(state);
    expect(readLlmState(params)).toEqual(state);
    expect(params.get('p')).toBe('70.6');
    expect(params.get('b')).toBe('0.5');
    expect(params.get('T')).toBe('131072');
  });

  it('restores a hand-written shared link', () => {
    const s = readLlmState(new URLSearchParams('p=8&kv=8&B=64&T=8192&phase=prefill&tf=100&bw=1.5'));
    expect(s).toMatchObject({ paramsB: 8, kvHeads: 8, batch: 64, context: 8192, phase: 'prefill', peakTflops: 100, bandwidthTBs: 1.5 });
  });

  it('ignores tampered or out-of-range values', () => {
    const s = readLlmState(
      new URLSearchParams('p=abc&b=3&L=0&H=-4&kv=1e3&dh=9999999&T=0&B=1.5&tf=Infinity&bw=&phase=train&depth=x'),
    );
    expect(s).toEqual(DEFAULT_LLM_STATE);
  });

  it('keeps unrelated parameters such as the section anchor', () => {
    const params = writeLlmState({ ...DEFAULT_LLM_STATE, batch: 8 }, new URLSearchParams('at=sources'));
    expect(params.get('at')).toBe('sources');
    expect(params.get('B')).toBe('8');
  });

  it('publishes limits that contain the defaults', () => {
    for (const [key, { min, max }] of Object.entries(LIMITS)) {
      const value = DEFAULT_LLM_STATE[key as keyof typeof LIMITS];
      expect(value).toBeGreaterThanOrEqual(min);
      expect(value).toBeLessThanOrEqual(max);
    }
  });
});

describe('field input helpers', () => {
  it('parses valid typed values', () => {
    expect(parseFieldInput('layers', '80')).toEqual({ value: 80 });
    expect(parseFieldInput('paramsB', '70.6')).toEqual({ value: 70.6 });
    expect(parseFieldInput('bandwidthTBs', ' .5 ')).toEqual({ value: 0.5 });
  });

  it('explains out-of-range, fractional or non-numeric input', () => {
    for (const [field, raw] of [
      ['layers', '0'],
      ['layers', '2.5'],
      ['batch', ''],
      ['context', '-3'],
      ['context', '1e5'],
      ['paramsB', 'abc'],
    ] as const) {
      const r = parseFieldInput(field, raw);
      expect('error' in r && r.error).toMatch(/between/);
    }
    expect(parseFieldInput('layers', '0')).toEqual({ error: 'Enter a whole number between 1 and 1,000.' });
  });

  it('halves and doubles within limits', () => {
    expect(scaleField('batch', 1, 2)).toBe(2);
    expect(scaleField('batch', 1, 0.5)).toBe(1);
    expect(scaleField('batch', 65536, 2)).toBe(65536);
    expect(scaleField('layers', 5, 0.5)).toBe(3);
    expect(scaleField('bandwidthTBs', 2, 0.5)).toBe(1);
    expect(scaleField('paramsB', 0.1, 0.5)).toBe(0.05);
  });
});
