import { describe, expect, it } from 'vitest';
import { assemble, disassemble } from './assembler';
import { createCpu, runTrace } from './cpu';
import { PRESET_PROGRAMS, getPreset } from './programs';

describe('assembler', () => {
  it('assembles mnemonics, numeric literals, labels and comments', () => {
    const result = assemble(`
      ; add two numbers
      start: LDA 14
             ADD 0xF   ; hex literal
             JC done
             OUT
      done:  HLT
      .data 14 0b0110
      .data 15 7
    `);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.program).toEqual([
      { op: 'LDA', arg: 14 },
      { op: 'ADD', arg: 15 },
      { op: 'JC', arg: 4 },
      { op: 'OUT', arg: 0 },
      { op: 'HLT', arg: 0 },
    ]);
    expect(result.ram[14]).toBe(6);
    expect(result.ram[15]).toBe(7);
  });

  it('is case-insensitive for mnemonics', () => {
    const result = assemble('ldi 3\nhlt');
    expect(result.ok && result.program[0]).toEqual({ op: 'LDI', arg: 3 });
  });

  it('reports errors with line numbers', () => {
    const result = assemble('LDI 3\nFOO 2\nLDA 99\nJMP nowhere\nOUT 3\nLDA');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const lines = result.errors.map((e) => e.line);
    expect(lines).toEqual([2, 3, 4, 5, 6]);
    expect(result.errors[0]?.message).toMatch(/unknown instruction/i);
    expect(result.errors[1]?.message).toMatch(/0.*15/);
  });

  it('rejects programs longer than 16 instructions and duplicate labels', () => {
    expect(assemble(Array(17).fill('NOP').join('\n')).ok).toBe(false);
    expect(assemble('a: NOP\na: NOP').ok).toBe(false);
  });

  it('disassembles back into source that re-assembles identically', () => {
    const src = 'LDA 14\nADD 15\nOUT\nHLT';
    const first = assemble(src);
    if (!first.ok) throw new Error('should assemble');
    const again = assemble(disassemble(first.program));
    expect(again.ok && again.program).toEqual(first.program);
  });
});

describe('preset programs', () => {
  it('have unique ids and all assemble', () => {
    const ids = PRESET_PROGRAMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of PRESET_PROGRAMS) {
      expect(assemble(preset.source).ok, preset.id).toBe(true);
    }
  });

  it.each(PRESET_PROGRAMS.map((p) => [p.id, p] as const))('%s halts with its documented output', (_id, preset) => {
    const asm = assemble(preset.source);
    if (!asm.ok) throw new Error('assembly failed');
    const trace = runTrace(createCpu(asm.program, asm.ram), 500);
    expect(trace.reason).toBe('halted');
    expect(trace.states.at(-1)?.outputs).toEqual(preset.expectedOutputs);
  });

  it('includes the worked example 6 + 7 = 13 and a looping multiplier', () => {
    expect(getPreset('add')?.expectedOutputs).toEqual([13]);
    expect(getPreset('multiply')?.expectedOutputs).toEqual([12]);
    expect(getPreset('nope')).toBeUndefined();
  });
});
