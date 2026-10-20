import { describe, expect, it } from 'vitest';
import {
  MAX_PROGRAM_LENGTH,
  createCpu,
  decodeInstruction,
  decodeProgram,
  encodeInstruction,
  encodeProgram,
  runTrace,
  step,
  type Instruction,
} from './cpu';

const prog = (...ins: Instruction[]) => ins;

describe('instruction encoding', () => {
  it('packs opcode in the high nibble and operand in the low nibble', () => {
    expect(encodeInstruction({ op: 'LDA', arg: 14 })).toBe(0x2e);
    expect(decodeInstruction(0x2e)).toEqual({ op: 'LDA', arg: 14 });
    expect(decodeInstruction(0x00)).toEqual({ op: 'NOP', arg: 0 });
  });

  it('round-trips a program through a hex string', () => {
    const p = prog({ op: 'LDA', arg: 14 }, { op: 'ADD', arg: 15 }, { op: 'OUT', arg: 0 }, { op: 'HLT', arg: 0 });
    const hex = encodeProgram(p);
    expect(hex).toMatch(/^[0-9a-f]+$/);
    expect(decodeProgram(hex)).toEqual(p);
  });

  it('rejects malformed hex and unknown opcodes', () => {
    expect(() => decodeProgram('zz')).toThrow();
    expect(() => decodeProgram('abc')).toThrow(); // odd length
    expect(() => decodeInstruction(0xf0)).toThrow(); // opcode 15 is unassigned
    expect(() => decodeProgram('00'.repeat(MAX_PROGRAM_LENGTH + 1))).toThrow();
  });
});

describe('CPU execution', () => {
  it('starts in a clean reset state with program memory padded with NOP', () => {
    const cpu = createCpu(prog({ op: 'HLT', arg: 0 }));
    expect(cpu.pc).toBe(0);
    expect(cpu.a).toBe(0);
    expect(cpu.flags).toEqual({ z: false, c: false });
    expect(cpu.program).toHaveLength(16);
    expect(cpu.program[5]).toEqual({ op: 'NOP', arg: 0 });
    expect(cpu.ram).toHaveLength(16);
    expect(cpu.halted).toBe(false);
    expect(cpu.outputs).toEqual([]);
  });

  it('does not mutate the previous state when stepping', () => {
    const cpu = createCpu(prog({ op: 'LDI', arg: 9 }, { op: 'HLT', arg: 0 }));
    const { state } = step(cpu);
    expect(cpu.a).toBe(0);
    expect(cpu.pc).toBe(0);
    expect(state.a).toBe(9);
    expect(state.pc).toBe(1);
    expect(state.steps).toBe(1);
  });

  it('LDA/ADD use the 4-bit adder and set carry and zero flags', () => {
    const ram = Array(16).fill(0);
    ram[14] = 9;
    ram[15] = 7;
    let cpu = createCpu(prog({ op: 'LDA', arg: 14 }, { op: 'ADD', arg: 15 }, { op: 'HLT', arg: 0 }), ram);
    cpu = step(cpu).state;
    expect(cpu.a).toBe(9);
    const result = step(cpu);
    expect(result.state.a).toBe(0); // 9 + 7 = 16 → wraps to 0
    expect(result.state.flags).toEqual({ z: true, c: true });
    expect(result.event.adder?.carryOut).toBe(1);
  });

  it('SUB computes A + NOT(M) + 1 so carry means "no borrow"', () => {
    const ram = Array(16).fill(0);
    ram[0] = 3;
    let cpu = createCpu(prog({ op: 'LDI', arg: 5 }, { op: 'SUB', arg: 0 }, { op: 'SUB', arg: 0 }), ram);
    cpu = step(cpu).state;
    cpu = step(cpu).state;
    expect(cpu.a).toBe(2);
    expect(cpu.flags.c).toBe(true);
    cpu = step(cpu).state;
    expect(cpu.a).toBe(15); // 2 - 3 = -1 → 1111
    expect(cpu.flags.c).toBe(false);
  });

  it('STA writes the accumulator to RAM', () => {
    const cpu = step(step(createCpu(prog({ op: 'LDI', arg: 6 }, { op: 'STA', arg: 3 }))).state).state;
    expect(cpu.ram[3]).toBe(6);
  });

  it('JMP, JZ and JC change the program counter', () => {
    const jmp = step(createCpu(prog({ op: 'JMP', arg: 7 }))).state;
    expect(jmp.pc).toBe(7);

    const notTaken = step(createCpu(prog({ op: 'JZ', arg: 7 }))).state;
    expect(notTaken.pc).toBe(1);

    const ram = Array(16).fill(0);
    ram[1] = 1;
    let cpu = createCpu(prog({ op: 'LDI', arg: 15 }, { op: 'ADD', arg: 1 }, { op: 'JC', arg: 9 }), ram);
    cpu = step(step(step(cpu).state).state).state;
    expect(cpu.pc).toBe(9);
  });

  it('OUT appends to the output history and HLT stops the machine', () => {
    let cpu = createCpu(prog({ op: 'LDI', arg: 4 }, { op: 'OUT', arg: 0 }, { op: 'HLT', arg: 0 }));
    cpu = step(step(cpu).state).state;
    expect(cpu.outputs).toEqual([4]);
    const halted = step(cpu);
    expect(halted.state.halted).toBe(true);
    const after = step(halted.state);
    expect(after.state).toBe(halted.state);
    expect(after.event.description).toMatch(/halted/i);
  });

  it('wraps the 4-bit program counter from 15 back to 0', () => {
    const cpu = { ...createCpu([]), pc: 15 };
    expect(step(cpu).state.pc).toBe(0);
  });

  it('describes each step in plain language', () => {
    const { event } = step(createCpu(prog({ op: 'LDI', arg: 9 })));
    expect(event.pc).toBe(0);
    expect(event.instruction).toEqual({ op: 'LDI', arg: 9 });
    expect(event.description).toMatch(/A/);
  });
});

describe('runTrace', () => {
  it('records every state until HLT', () => {
    const trace = runTrace(createCpu(prog({ op: 'LDI', arg: 2 }, { op: 'OUT', arg: 0 }, { op: 'HLT', arg: 0 })), 100);
    expect(trace.reason).toBe('halted');
    expect(trace.states).toHaveLength(4); // initial + 3 steps
    expect(trace.events).toHaveLength(3);
    expect(trace.states.at(-1)?.outputs).toEqual([2]);
  });

  it('stops at the step budget for programs that never halt', () => {
    const trace = runTrace(createCpu(prog({ op: 'JMP', arg: 0 })), 50);
    expect(trace.reason).toBe('budget');
    expect(trace.events).toHaveLength(50);
  });
});
