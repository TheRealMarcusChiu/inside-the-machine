import { evaluateGate, type Bit } from './gates';

/** Convert a non-negative integer to an LSB-first array of bits. */
export function toBits(value: number, width: number): Bit[] {
  if (!Number.isInteger(value) || value < 0 || value >= 2 ** width) {
    throw new RangeError(`${value} does not fit in ${width} unsigned bits`);
  }
  return Array.from({ length: width }, (_, i) => ((value >> i) & 1) as Bit);
}

/** Convert an LSB-first array of bits back to an integer. */
export function fromBits(bits: readonly Bit[]): number {
  return bits.reduce<number>((acc, bit, i) => acc + bit * 2 ** i, 0);
}

/** Interpret an unsigned value as a two's-complement signed integer. */
export function toSigned(value: number, width: number): number {
  return value >= 2 ** (width - 1) ? value - 2 ** width : value;
}

export function halfAdder(a: Bit, b: Bit): { sum: Bit; carry: Bit } {
  return { sum: evaluateGate('XOR', a, b), carry: evaluateGate('AND', a, b) };
}

export interface FullAdderResult {
  sum: Bit;
  carryOut: Bit;
  /** Intermediate wires, named after the gates that drive them. */
  signals: { aXorB: Bit; aAndB: Bit; cinAndAXorB: Bit };
}

/**
 * Full adder built from five gates:
 *   sum  = (a XOR b) XOR cin
 *   cout = (a AND b) OR (cin AND (a XOR b))
 */
export function fullAdder(a: Bit, b: Bit, cin: Bit): FullAdderResult {
  const aXorB = evaluateGate('XOR', a, b);
  const aAndB = evaluateGate('AND', a, b);
  const cinAndAXorB = evaluateGate('AND', cin, aXorB);
  return {
    sum: evaluateGate('XOR', aXorB, cin),
    carryOut: evaluateGate('OR', aAndB, cinAndAXorB),
    signals: { aXorB, aAndB, cinAndAXorB },
  };
}

export interface AdderResult {
  width: number;
  a: number;
  b: number;
  cin: Bit;
  aBits: Bit[];
  bBits: Bit[];
  /** Result modulo 2^width. */
  sum: number;
  sumBits: Bit[];
  /** carries[i] is the carry INTO stage i; carries[width] is the carry out. */
  carries: Bit[];
  carryOut: Bit;
  /** Two's-complement overflow: carry into the sign bit ≠ carry out of it. */
  overflow: boolean;
  stages: FullAdderResult[];
  /**
   * Settle times in "gate delays" under an idealised unit-delay model
   * (every gate takes exactly one delay; inputs settle at t = 0).
   */
  delays: { sum: number[]; carry: number[]; critical: number };
}

export function rippleAdd(a: number, b: number, width: number, cin: Bit = 0): AdderResult {
  if (!Number.isInteger(width) || width < 1 || width > 16) {
    throw new RangeError(`width must be an integer from 1 to 16, got ${width}`);
  }
  const aBits = toBits(a, width);
  const bBits = toBits(b, width);
  const carries: Bit[] = [cin];
  const carryDelay: number[] = [0];
  const sumDelay: number[] = [];
  const stages: FullAdderResult[] = [];

  for (let i = 0; i < width; i++) {
    const stage = fullAdder(aBits[i]!, bBits[i]!, carries[i]!);
    stages.push(stage);
    carries.push(stage.carryOut);
    // Timing: a XOR b and a AND b settle at t=1 (inputs at 0).
    const tXor = 1;
    const tAnd = 1;
    const tCinAnd = Math.max(carryDelay[i]!, tXor) + 1;
    sumDelay.push(Math.max(tXor, carryDelay[i]!) + 1);
    carryDelay.push(Math.max(tAnd, tCinAnd) + 1);
  }

  const sumBits = stages.map((s) => s.sum);
  const carryOut = carries[width]!;
  return {
    width,
    a,
    b,
    cin,
    aBits,
    bBits,
    sum: fromBits(sumBits),
    sumBits,
    carries,
    carryOut,
    overflow: carries[width - 1] !== carryOut,
    stages,
    delays: {
      sum: sumDelay,
      carry: carryDelay,
      critical: Math.max(...sumDelay, ...carryDelay),
    },
  };
}

export function add4(a: number, b: number, cin: Bit = 0): AdderResult {
  return rippleAdd(a, b, 4, cin);
}
