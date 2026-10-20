import { add4 } from './adder';
import { assemble } from './assembler';
import { createCpu, runTrace } from './cpu';
import type { Bit } from './gates';

export const ADDER_CHALLENGE = {
  targetSum: 2,
  targetCarry: 1 as Bit,
  prompt:
    'Set A, B and carry-in so the 4-bit adder displays 0010 with carry-out lit. ' +
    'What true total does that represent?',
} as const;

export interface ChallengeResult {
  solved: boolean;
  hint: string;
}

export function checkAdderChallenge(a: number, b: number, cin: Bit): ChallengeResult {
  const r = add4(a, b, cin);
  if (r.sum === ADDER_CHALLENGE.targetSum && r.carryOut === ADDER_CHALLENGE.targetCarry) {
    return {
      solved: true,
      hint: `Solved: ${a} + ${b}${cin ? ' + 1' : ''} = ${a + b + cin} = 16 + 2. The carry-out is worth 16.`,
    };
  }
  if (r.carryOut === 0) {
    return { solved: false, hint: 'The carry-out is dark — your total still fits in 4 bits. Make it bigger than 15.' };
  }
  return {
    solved: false,
    hint: `Carry-out is lit, but the sum shows ${r.sum}. With carry worth 16, which total gives 0010? (Hint: 18.)`,
  };
}

export const CPU_CHALLENGE = {
  expectedOutputs: [5],
  stepBudget: 256,
  prompt:
    'Stretch: write a Museum-4 program that computes 9 − 4 with the SUB instruction, ' +
    'OUTputs the answer once and halts.',
} as const;

/** Assemble and run a visitor's program, then judge it against CPU_CHALLENGE. */
export function checkCpuChallenge(source: string): ChallengeResult {
  const asm = assemble(source);
  if (!asm.ok) {
    const first = asm.errors[0]!;
    return { solved: false, hint: `Fix the assembly first — line ${first.line}: ${first.message}` };
  }
  if (!asm.program.some((ins) => ins.op === 'SUB')) {
    return { solved: false, hint: 'Make the adder do the work: the program must use SUB.' };
  }
  const trace = runTrace(createCpu(asm.program, asm.ram), CPU_CHALLENGE.stepBudget);
  if (trace.reason === 'budget') {
    return { solved: false, hint: `Still running after ${CPU_CHALLENGE.stepBudget} steps — does every path reach HLT?` };
  }
  const outputs = trace.states.at(-1)!.outputs;
  if (outputs.length === 1 && outputs[0] === CPU_CHALLENGE.expectedOutputs[0]) {
    return { solved: true, hint: 'Solved: the subtractor computed 9 + NOT(4) + 1 = 5 (carry-out 1 means no borrow).' };
  }
  const shown = outputs.length ? outputs.join(', ') : 'nothing';
  return { solved: false, hint: `OUT displayed ${shown}; it should display 5 exactly once. Check which value is subtracted from which.` };
}
