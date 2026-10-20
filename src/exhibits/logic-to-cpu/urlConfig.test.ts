import { describe, expect, it } from 'vitest';
import { DEFAULT_EXHIBIT_STATE, readExhibitState, writeExhibitState } from './urlConfig';

describe('logic-to-cpu URL configuration', () => {
  it('uses the worked example as the default configuration', () => {
    expect(DEFAULT_EXHIBIT_STATE).toMatchObject({ depth: 'short', gate: 'AND', a: 6, b: 7, cin: 0, program: 'add' });
    expect(readExhibitState(new URLSearchParams())).toEqual(DEFAULT_EXHIBIT_STATE);
  });

  it('restores a shared configuration', () => {
    const s = readExhibitState(new URLSearchParams('depth=deep&gate=XOR&ga=1&gb=0&a=9&b=9&cin=1&prog=multiply'));
    expect(s).toMatchObject({ depth: 'deep', gate: 'XOR', ga: 1, gb: 0, a: 9, b: 9, cin: 1, program: 'multiply' });
  });

  it('ignores tampered values', () => {
    const s = readExhibitState(new URLSearchParams('gate=MAYBE&a=300&prog=../../etc'));
    expect(s.gate).toBe('AND');
    expect(s.a).toBe(6);
    expect(s.program).toBe('add');
  });

  it('serialises custom programs as source text and keeps other params', () => {
    const params = writeExhibitState(
      { ...DEFAULT_EXHIBIT_STATE, program: 'custom', source: 'LDI 5\nOUT\nHLT' },
      new URLSearchParams('motion=reduce'),
    );
    expect(params.get('prog')).toBe('custom');
    expect(params.get('motion')).toBe('reduce');
    expect(readExhibitState(params).source).toBe('LDI 5\nOUT\nHLT');
  });

  it('writes nothing for the default state', () => {
    expect(writeExhibitState(DEFAULT_EXHIBIT_STATE).toString()).toBe('');
  });
});
