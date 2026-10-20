/**
 * A deliberately tiny, invented 4-bit accumulator machine ("the Museum-4").
 *
 * - Harvard layout: 16 instruction slots (program memory) + 16 data nibbles (RAM).
 * - One 4-bit accumulator A, a 4-bit program counter, Z (zero) and C (carry) flags.
 * - Instructions are one byte: high nibble = opcode, low nibble = operand.
 * - ADD and SUB are executed by the same ripple-carry adder shown in the exhibit.
 * - One `step` executes a whole instruction (fetch → decode → execute).
 *
 * It is not modelled on any commercial CPU; it is in the spirit of teaching
 * machines such as Malvino's SAP-1 and Nisan & Schocken's Hack.
 */
import { add4, type AdderResult } from './adder';

export const MAX_PROGRAM_LENGTH = 16;
export const RAM_SIZE = 16;

export const OPCODES = {
  NOP: 0x0,
  LDI: 0x1,
  LDA: 0x2,
  STA: 0x3,
  ADD: 0x4,
  SUB: 0x5,
  JMP: 0x6,
  JZ: 0x7,
  JC: 0x8,
  OUT: 0x9,
  HLT: 0xa,
} as const;

export type Opcode = keyof typeof OPCODES;

const OPCODE_BY_NUMBER = new Map<number, Opcode>(
  (Object.entries(OPCODES) as [Opcode, number][]).map(([name, code]) => [code, name]),
);

/** Which instructions take an operand, and what kind. */
export const OPERAND_KIND: Record<Opcode, 'none' | 'value' | 'address' | 'target'> = {
  NOP: 'none',
  LDI: 'value',
  LDA: 'address',
  STA: 'address',
  ADD: 'address',
  SUB: 'address',
  JMP: 'target',
  JZ: 'target',
  JC: 'target',
  OUT: 'none',
  HLT: 'none',
};

export const OPCODE_SUMMARY: Record<Opcode, string> = {
  NOP: 'do nothing',
  LDI: 'A ← n (load immediate value)',
  LDA: 'A ← RAM[addr]',
  STA: 'RAM[addr] ← A',
  ADD: 'A ← A + RAM[addr]; sets Z, C',
  SUB: 'A ← A − RAM[addr]; sets Z, C (C=1 means no borrow)',
  JMP: 'PC ← addr',
  JZ: 'if Z: PC ← addr',
  JC: 'if C: PC ← addr',
  OUT: 'output A',
  HLT: 'stop the clock',
};

export interface Instruction {
  op: Opcode;
  arg: number;
}

export interface CpuFlags {
  z: boolean;
  c: boolean;
}

export interface CpuState {
  pc: number;
  a: number;
  flags: CpuFlags;
  program: Instruction[];
  ram: number[];
  outputs: number[];
  halted: boolean;
  steps: number;
}

export interface StepEvent {
  /** Address the instruction was fetched from. */
  pc: number;
  instruction: Instruction;
  byte: number;
  description: string;
  /** Present for ADD/SUB: the full adder trace used to compute the result. */
  adder?: AdderResult;
}

const NOP: Instruction = { op: 'NOP', arg: 0 };

function assertNibble(n: number, what: string) {
  if (!Number.isInteger(n) || n < 0 || n > 15) throw new RangeError(`${what} must be 0–15, got ${n}`);
}

export function encodeInstruction(ins: Instruction): number {
  assertNibble(ins.arg, 'operand');
  return (OPCODES[ins.op] << 4) | ins.arg;
}

export function decodeInstruction(byte: number): Instruction {
  if (!Number.isInteger(byte) || byte < 0 || byte > 0xff) throw new RangeError(`not a byte: ${byte}`);
  const op = OPCODE_BY_NUMBER.get(byte >> 4);
  if (!op) throw new RangeError(`unassigned opcode 0x${(byte >> 4).toString(16)}`);
  return { op, arg: byte & 0xf };
}

export function encodeProgram(program: readonly Instruction[]): string {
  return program.map((ins) => encodeInstruction(ins).toString(16).padStart(2, '0')).join('');
}

export function decodeProgram(hex: string): Instruction[] {
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(hex)) throw new Error('program must be an even-length hex string');
  if (hex.length / 2 > MAX_PROGRAM_LENGTH) throw new Error(`program exceeds ${MAX_PROGRAM_LENGTH} instructions`);
  const out: Instruction[] = [];
  for (let i = 0; i < hex.length; i += 2) out.push(decodeInstruction(parseInt(hex.slice(i, i + 2), 16)));
  return out;
}

export function createCpu(program: readonly Instruction[], ram: readonly number[] = []): CpuState {
  if (program.length > MAX_PROGRAM_LENGTH) throw new RangeError(`program exceeds ${MAX_PROGRAM_LENGTH} instructions`);
  if (ram.length > RAM_SIZE) throw new RangeError(`RAM has only ${RAM_SIZE} cells`);
  program.forEach((ins) => assertNibble(ins.arg, 'operand'));
  ram.forEach((v) => assertNibble(v, 'RAM value'));
  return {
    pc: 0,
    a: 0,
    flags: { z: false, c: false },
    program: Array.from({ length: MAX_PROGRAM_LENGTH }, (_, i) => program[i] ?? NOP),
    ram: Array.from({ length: RAM_SIZE }, (_, i) => ram[i] ?? 0),
    outputs: [],
    halted: false,
    steps: 0,
  };
}

const nextPc = (pc: number) => (pc + 1) & 0xf;

/** Execute exactly one instruction. Pure: returns a new state and never mutates `state`. */
export function step(state: CpuState): { state: CpuState; event: StepEvent } {
  const instruction = state.program[state.pc] ?? NOP;
  const byte = encodeInstruction(instruction);
  const base = { pc: state.pc, instruction, byte };

  if (state.halted) {
    return { state, event: { ...base, description: 'The machine is halted; the clock is stopped. Reset to run again.' } };
  }

  const { op, arg } = instruction;
  let next: CpuState = { ...state, pc: nextPc(state.pc), steps: state.steps + 1 };
  let description: string;
  let adder: AdderResult | undefined;

  switch (op) {
    case 'NOP':
      description = 'NOP: nothing happens except the program counter advancing.';
      break;
    case 'LDI':
      next.a = arg;
      description = `LDI ${arg}: copy the value ${arg} straight into A.`;
      break;
    case 'LDA':
      next.a = state.ram[arg]!;
      description = `LDA ${arg}: read RAM[${arg}] = ${state.ram[arg]} into A.`;
      break;
    case 'STA': {
      const ram = [...state.ram];
      ram[arg] = state.a;
      next.ram = ram;
      description = `STA ${arg}: write A = ${state.a} into RAM[${arg}].`;
      break;
    }
    case 'ADD': {
      const m = state.ram[arg]!;
      adder = add4(state.a, m, 0);
      next.a = adder.sum;
      next.flags = { z: adder.sum === 0, c: adder.carryOut === 1 };
      description = `ADD ${arg}: the adder computes ${state.a} + ${m} = ${adder.sum}${
        adder.carryOut ? ` with carry out (true total ${state.a + m} does not fit in 4 bits)` : ''
      }.`;
      break;
    }
    case 'SUB': {
      const m = state.ram[arg]!;
      // Two's complement: A − M = A + NOT(M) + 1, using the same adder with carry-in 1.
      adder = add4(state.a, ~m & 0xf, 1);
      next.a = adder.sum;
      next.flags = { z: adder.sum === 0, c: adder.carryOut === 1 };
      description = `SUB ${arg}: compute ${state.a} − ${m} as ${state.a} + NOT(${m}) + 1 = ${adder.sum}${
        adder.carryOut ? '' : ' (borrow: the result wrapped below zero)'
      }.`;
      break;
    }
    case 'JMP':
      next.pc = arg;
      description = `JMP ${arg}: load ${arg} into the program counter.`;
      break;
    case 'JZ':
      if (state.flags.z) next.pc = arg;
      description = state.flags.z ? `JZ ${arg}: Z is set, so jump to ${arg}.` : `JZ ${arg}: Z is clear, so carry on.`;
      break;
    case 'JC':
      if (state.flags.c) next.pc = arg;
      description = state.flags.c ? `JC ${arg}: C is set, so jump to ${arg}.` : `JC ${arg}: C is clear, so carry on.`;
      break;
    case 'OUT':
      next.outputs = [...state.outputs, state.a];
      description = `OUT: display A = ${state.a}.`;
      break;
    case 'HLT':
      next = { ...next, pc: state.pc, halted: true };
      description = 'HLT: stop the clock.';
      break;
  }

  return { state: next, event: { ...base, description, adder } };
}

export interface CpuTrace {
  /** states[0] is the starting state; states[i + 1] follows events[i]. */
  states: CpuState[];
  events: StepEvent[];
  reason: 'halted' | 'budget';
}

export function runTrace(start: CpuState, maxSteps: number): CpuTrace {
  const states = [start];
  const events: StepEvent[] = [];
  let current = start;
  while (!current.halted && events.length < maxSteps) {
    const r = step(current);
    current = r.state;
    states.push(current);
    events.push(r.event);
  }
  return { states, events, reason: current.halted ? 'halted' : 'budget' };
}
