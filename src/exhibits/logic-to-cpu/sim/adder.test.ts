import { describe, expect, it } from 'vitest';
import { add4, fromBits, fullAdder, halfAdder, rippleAdd, toBits, toSigned } from './adder';

describe('bit helpers', () => {
  it('converts numbers to LSB-first bit arrays and back', () => {
    expect(toBits(6, 4)).toEqual([0, 1, 1, 0]);
    expect(toBits(15, 4)).toEqual([1, 1, 1, 1]);
    expect(fromBits([0, 1, 1, 0])).toBe(6);
    for (let n = 0; n < 16; n++) expect(fromBits(toBits(n, 4))).toBe(n);
  });

  it('rejects values that do not fit in the requested width', () => {
    expect(() => toBits(16, 4)).toThrow(RangeError);
    expect(() => toBits(-1, 4)).toThrow(RangeError);
    expect(() => toBits(1.5, 4)).toThrow(RangeError);
  });

  it('interprets values as two’s-complement signed integers', () => {
    expect(toSigned(7, 4)).toBe(7);
    expect(toSigned(8, 4)).toBe(-8);
    expect(toSigned(15, 4)).toBe(-1);
  });
});

describe('half and full adders', () => {
  it('half adder: sum is XOR, carry is AND', () => {
    expect(halfAdder(0, 0)).toEqual({ sum: 0, carry: 0 });
    expect(halfAdder(1, 0)).toEqual({ sum: 1, carry: 0 });
    expect(halfAdder(1, 1)).toEqual({ sum: 0, carry: 1 });
  });

  it('full adder adds three bits for every combination', () => {
    for (const a of [0, 1] as const)
      for (const b of [0, 1] as const)
        for (const c of [0, 1] as const) {
          const r = fullAdder(a, b, c);
          expect(r.sum + 2 * r.carryOut).toBe(a + b + c);
        }
  });

  it('exposes internal gate signals for the diagram', () => {
    const r = fullAdder(1, 0, 1);
    expect(r.signals).toEqual({ aXorB: 1, aAndB: 0, cinAndAXorB: 1 });
  });
});

describe('4-bit ripple-carry adder', () => {
  it('matches integer addition modulo 16 for all 512 input combinations', () => {
    for (let a = 0; a < 16; a++)
      for (let b = 0; b < 16; b++)
        for (const cin of [0, 1] as const) {
          const r = add4(a, b, cin);
          const total = a + b + cin;
          expect(r.sum).toBe(total % 16);
          expect(r.carryOut).toBe(total > 15 ? 1 : 0);
        }
  });

  it('records the carry chain c0..c4 for the worked example 6 + 7', () => {
    const r = add4(6, 7);
    expect(r.sumBits).toEqual([1, 0, 1, 1]); // 13 = 1101, LSB first
    expect(r.sum).toBe(13);
    expect(r.carries).toEqual([0, 0, 1, 1, 0]);
    expect(r.stages).toHaveLength(4);
  });

  it('flags signed overflow only when the sign bit is wrong', () => {
    expect(add4(7, 1).overflow).toBe(true); // 7 + 1 = -8 in 4-bit signed
    expect(add4(15, 1).overflow).toBe(false); // -1 + 1 = 0
    expect(add4(8, 8).overflow).toBe(true); // -8 + -8
    expect(add4(8, 8).carryOut).toBe(1);
    expect(add4(3, 2).overflow).toBe(false);
  });

  it('computes settle times under a unit-gate-delay model (carry: 2n+1)', () => {
    const r = add4(0, 0);
    expect(r.delays.carry).toEqual([0, 3, 5, 7, 9]);
    expect(r.delays.sum).toEqual([2, 4, 6, 8]);
    expect(r.delays.critical).toBe(9);
    expect(rippleAdd(0, 0, 8).delays.critical).toBe(17);
  });

  it('validates its inputs', () => {
    expect(() => add4(16, 0)).toThrow(RangeError);
    expect(() => rippleAdd(1, 1, 0)).toThrow(RangeError);
  });
});
