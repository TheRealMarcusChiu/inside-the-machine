import { describe, expect, it } from 'vitest';
import { GATE_TYPES, evaluateGate, gateArity, truthTable, evaluateWithNand } from './gates';

describe('logic gates', () => {
  it('exposes the seven standard gates', () => {
    expect([...GATE_TYPES].sort()).toEqual(['AND', 'NAND', 'NOR', 'NOT', 'OR', 'XNOR', 'XOR']);
  });

  it.each([
    ['AND', [0, 0, 0, 1]],
    ['OR', [0, 1, 1, 1]],
    ['XOR', [0, 1, 1, 0]],
    ['NAND', [1, 1, 1, 0]],
    ['NOR', [1, 0, 0, 0]],
    ['XNOR', [1, 0, 0, 1]],
  ] as const)('%s matches its canonical truth table (inputs 00,01,10,11)', (gate, expected) => {
    const outputs = [
      evaluateGate(gate, 0, 0),
      evaluateGate(gate, 0, 1),
      evaluateGate(gate, 1, 0),
      evaluateGate(gate, 1, 1),
    ];
    expect(outputs).toEqual(expected);
  });

  it('NOT is unary and ignores the second input', () => {
    expect(gateArity('NOT')).toBe(1);
    expect(gateArity('XOR')).toBe(2);
    expect(evaluateGate('NOT', 0)).toBe(1);
    expect(evaluateGate('NOT', 1, 1)).toBe(0);
  });

  it('builds truth tables with one row per input combination', () => {
    expect(truthTable('NOT')).toEqual([
      { inputs: [0], output: 1 },
      { inputs: [1], output: 0 },
    ]);
    const and = truthTable('AND');
    expect(and).toHaveLength(4);
    expect(and[3]).toEqual({ inputs: [1, 1], output: 1 });
  });

  it('every gate can be reproduced from NAND gates alone (functional completeness)', () => {
    for (const gate of GATE_TYPES) {
      for (const a of [0, 1] as const) {
        for (const b of [0, 1] as const) {
          expect(evaluateWithNand(gate, a, b).output).toBe(evaluateGate(gate, a, b));
        }
      }
    }
  });

  it('reports how many NAND gates each construction uses', () => {
    expect(evaluateWithNand('NAND', 1, 1).nandCount).toBe(1);
    expect(evaluateWithNand('NOT', 1, 0).nandCount).toBe(1);
    expect(evaluateWithNand('AND', 1, 1).nandCount).toBe(2);
    expect(evaluateWithNand('OR', 0, 1).nandCount).toBe(3);
    expect(evaluateWithNand('XOR', 0, 1).nandCount).toBe(4);
  });
});
