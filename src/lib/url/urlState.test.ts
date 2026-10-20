import { describe, expect, it } from 'vitest';
import { codecs, readState, writeState, type StateSchema } from './urlState';

interface Demo {
  depth: 'short' | 'deep';
  a: number;
  bit: 0 | 1;
  on: boolean;
  note: string;
}

const schema: StateSchema<Demo> = {
  depth: { key: 'depth', codec: codecs.oneOf(['short', 'deep'] as const), default: 'short' },
  a: { key: 'a', codec: codecs.int(0, 15), default: 0 },
  bit: { key: 'c', codec: codecs.bit(), default: 0 },
  on: { key: 'on', codec: codecs.bool(), default: false },
  note: { key: 'src', codec: codecs.text(64), default: '' },
};

describe('codecs', () => {
  it('int accepts in-range integers and rejects everything else', () => {
    const c = codecs.int(0, 15);
    expect(c.parse('7')).toBe(7);
    expect(c.parse('16')).toBeUndefined();
    expect(c.parse('-1')).toBeUndefined();
    expect(c.parse('3.5')).toBeUndefined();
    expect(c.parse('1e1')).toBeUndefined();
    expect(c.parse('')).toBeUndefined();
    expect(c.parse(null)).toBeUndefined();
    expect(c.serialize(12)).toBe('12');
  });

  it('oneOf only accepts listed values', () => {
    const c = codecs.oneOf(['AND', 'OR'] as const);
    expect(c.parse('OR')).toBe('OR');
    expect(c.parse('or')).toBeUndefined();
    expect(c.parse('__proto__')).toBeUndefined();
  });

  it('bit and bool parse compact forms', () => {
    expect(codecs.bit().parse('1')).toBe(1);
    expect(codecs.bit().parse('2')).toBeUndefined();
    expect(codecs.bool().parse('1')).toBe(true);
    expect(codecs.bool().parse('0')).toBe(false);
    expect(codecs.bool().serialize(true)).toBe('1');
  });

  it('text round-trips unicode via URL-safe base64 and enforces a length cap', () => {
    const c = codecs.text(64);
    const raw = 'LDA 14 ; ünïcødé → ok\nHLT';
    const encoded = c.serialize(raw);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]*$/);
    expect(c.parse(encoded)).toBe(raw);
    expect(c.parse('!!!not base64!!!')).toBeUndefined();
    expect(c.parse(codecs.text(1000).serialize('x'.repeat(65)))).toBeUndefined();
  });
});

describe('readState / writeState', () => {
  it('falls back to defaults for missing or invalid values', () => {
    const state = readState(schema, new URLSearchParams('depth=deep&a=99&c=1'));
    expect(state).toEqual({ depth: 'deep', a: 0, bit: 1, on: false, note: '' });
  });

  it('omits defaults so shared URLs stay short', () => {
    const params = writeState(schema, { depth: 'short', a: 5, bit: 0, on: false, note: '' });
    expect(params.toString()).toBe('a=5');
  });

  it('preserves unrelated params owned by other modules', () => {
    const base = new URLSearchParams('motion=reduce&a=3');
    const params = writeState(schema, { depth: 'deep', a: 0, bit: 0, on: true, note: '' }, base);
    expect(params.get('motion')).toBe('reduce');
    expect(params.has('a')).toBe(false);
    expect(params.get('depth')).toBe('deep');
    expect(params.get('on')).toBe('1');
    expect(base.get('a')).toBe('3'); // input not mutated
  });

  it('round-trips arbitrary state', () => {
    const value: Demo = { depth: 'deep', a: 15, bit: 1, on: true, note: 'hello world' };
    expect(readState(schema, writeState(schema, value))).toEqual(value);
  });
});
