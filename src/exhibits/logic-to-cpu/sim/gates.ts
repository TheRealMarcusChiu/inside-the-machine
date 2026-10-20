/**
 * Ideal two-valued logic gates. Pure functions — no timing, voltage or noise.
 * See the exhibit's "Assumptions, units & limitations" section.
 */
export type Bit = 0 | 1;

export type GateType = 'AND' | 'OR' | 'XOR' | 'NAND' | 'NOR' | 'XNOR' | 'NOT';

export const GATE_TYPES: readonly GateType[] = ['AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR', 'NOT'];

export function gateArity(type: GateType): 1 | 2 {
  return type === 'NOT' ? 1 : 2;
}

export function evaluateGate(type: GateType, a: Bit, b: Bit = 0): Bit {
  switch (type) {
    case 'AND':
      return (a & b) as Bit;
    case 'OR':
      return (a | b) as Bit;
    case 'XOR':
      return (a ^ b) as Bit;
    case 'NAND':
      return (1 - (a & b)) as Bit;
    case 'NOR':
      return (1 - (a | b)) as Bit;
    case 'XNOR':
      return (1 - (a ^ b)) as Bit;
    case 'NOT':
      return (1 - a) as Bit;
  }
}

export interface TruthTableRow {
  inputs: Bit[];
  output: Bit;
}

export function truthTable(type: GateType): TruthTableRow[] {
  if (gateArity(type) === 1) {
    return ([0, 1] as const).map((a) => ({ inputs: [a], output: evaluateGate(type, a) }));
  }
  const rows: TruthTableRow[] = [];
  for (const a of [0, 1] as const) {
    for (const b of [0, 1] as const) rows.push({ inputs: [a, b], output: evaluateGate(type, a, b) });
  }
  return rows;
}

/**
 * Re-derive every gate using only NAND gates, counting how many NANDs each
 * construction needs. This is the classic demonstration that NAND is
 * functionally complete (universal).
 */
export function evaluateWithNand(type: GateType, a: Bit, b: Bit = 0): { output: Bit; nandCount: number } {
  let count = 0;
  const nand = (x: Bit, y: Bit): Bit => {
    count++;
    return (1 - (x & y)) as Bit;
  };
  const not = (x: Bit) => nand(x, x);
  const and = (x: Bit, y: Bit) => not(nand(x, y));
  const or = (x: Bit, y: Bit) => nand(not(x), not(y));
  const xor = (x: Bit, y: Bit) => {
    const m = nand(x, y);
    return nand(nand(x, m), nand(y, m));
  };

  let output: Bit;
  switch (type) {
    case 'NAND':
      output = nand(a, b);
      break;
    case 'NOT':
      output = not(a);
      break;
    case 'AND':
      output = and(a, b);
      break;
    case 'OR':
      output = or(a, b);
      break;
    case 'NOR':
      output = not(or(a, b));
      break;
    case 'XOR':
      output = xor(a, b);
      break;
    case 'XNOR':
      output = not(xor(a, b));
      break;
  }
  return { output, nandCount: count };
}
