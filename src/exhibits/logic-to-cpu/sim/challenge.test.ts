import { describe, expect, it } from 'vitest';
import { ADDER_CHALLENGE, CPU_CHALLENGE, checkAdderChallenge, checkCpuChallenge } from './challenge';

describe('adder challenge: display 0010 with carry-out 1', () => {
  it('describes the goal', () => {
    expect(ADDER_CHALLENGE.targetSum).toBe(2);
    expect(ADDER_CHALLENGE.targetCarry).toBe(1);
  });

  it('accepts every input pair whose true total is 18', () => {
    expect(checkAdderChallenge(9, 9, 0).solved).toBe(true);
    expect(checkAdderChallenge(15, 3, 0).solved).toBe(true);
    expect(checkAdderChallenge(8, 9, 1).solved).toBe(true);
  });

  it('gives a specific hint when close', () => {
    const noCarry = checkAdderChallenge(1, 1, 0);
    expect(noCarry.solved).toBe(false);
    expect(noCarry.hint).toMatch(/carry/i);

    const wrongSum = checkAdderChallenge(15, 15, 0);
    expect(wrongSum.solved).toBe(false);
    expect(wrongSum.hint).toMatch(/18/);
  });
});

describe('CPU stretch challenge: compute 9 − 4 with SUB', () => {
  const solution = `LDA 14
SUB 15
OUT
HLT
.data 14 9
.data 15 4`;

  it('accepts a halting program that uses SUB and outputs exactly 5', () => {
    expect(CPU_CHALLENGE.expectedOutputs).toEqual([5]);
    expect(checkCpuChallenge(solution).solved).toBe(true);
  });

  it('reports assembly errors instead of running', () => {
    const r = checkCpuChallenge('BOGUS');
    expect(r.solved).toBe(false);
    expect(r.hint).toMatch(/line 1/i);
  });

  it('insists on the subtractor, not a shortcut', () => {
    const r = checkCpuChallenge('LDI 5\nOUT\nHLT');
    expect(r.solved).toBe(false);
    expect(r.hint).toMatch(/SUB/);
  });

  it('explains wrong outputs and programs that never halt', () => {
    expect(checkCpuChallenge('LDA 14\nSUB 15\nOUT\nHLT\n.data 14 4\n.data 15 9').hint).toMatch(/11/);
    expect(checkCpuChallenge('loop: SUB 15\nJMP loop').hint).toMatch(/HLT/);
  });
});
