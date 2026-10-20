import { describe, expect, it } from 'vitest';
import { createCpuLabState, cpuLabReducer, keyToCpuCommand, RUN_STEP_BUDGET } from './cpuLabState';
import { assemble } from './sim/assembler';
import { createCpu, runTrace } from './sim/cpu';
import { getPreset } from './sim/programs';

function lab(id = 'add') {
  const asm = assemble(getPreset(id)!.source);
  if (!asm.ok) throw new Error('bad preset');
  return createCpuLabState(createCpu(asm.program, asm.ram));
}

describe('CPU lab state machine', () => {
  it('starts idle at the reset state', () => {
    const s = lab();
    expect(s.mode).toBe('idle');
    expect(s.current).toBe(s.initial);
    expect(s.log).toEqual([]);
  });

  it('step advances one instruction and logs it', () => {
    const s = cpuLabReducer(lab(), { type: 'step' });
    expect(s.current.pc).toBe(1);
    expect(s.log).toHaveLength(1);
  });

  it('run → tick → pause', () => {
    let s = cpuLabReducer(lab(), { type: 'run' });
    expect(s.mode).toBe('running');
    s = cpuLabReducer(s, { type: 'tick' });
    expect(s.current.steps).toBe(1);
    s = cpuLabReducer(s, { type: 'pause' });
    expect(s.mode).toBe('idle');
    expect(cpuLabReducer(s, { type: 'tick' })).toBe(s); // ticks ignored while paused
  });

  it('stops running automatically when the CPU halts', () => {
    let s = cpuLabReducer(lab(), { type: 'run' });
    for (let i = 0; i < 10; i++) s = cpuLabReducer(s, { type: 'tick' });
    expect(s.mode).toBe('idle');
    expect(s.current.halted).toBe(true);
    expect(s.current.outputs).toEqual([13]);
  });

  it('stops running at the step budget for non-halting programs', () => {
    let s = createCpuLabState(createCpu([{ op: 'JMP', arg: 0 }]));
    s = cpuLabReducer(s, { type: 'run' });
    for (let i = 0; i < RUN_STEP_BUDGET + 5; i++) s = cpuLabReducer(s, { type: 'tick' });
    expect(s.mode).toBe('idle');
    expect(s.current.steps).toBe(RUN_STEP_BUDGET);
    expect(s.notice).toMatch(/budget/i);
  });

  it('reset returns to the initial state and clears the log', () => {
    let s = cpuLabReducer(cpuLabReducer(lab(), { type: 'step' }), { type: 'step' });
    s = cpuLabReducer(s, { type: 'reset' });
    expect(s.current).toBe(s.initial);
    expect(s.log).toEqual([]);
    expect(s.mode).toBe('idle');
  });

  it('replay walks through a precomputed trace from the start', () => {
    const base = cpuLabReducer(lab(), { type: 'step' });
    const trace = runTrace(base.initial, 100);
    let s = cpuLabReducer(base, { type: 'replay', trace });
    expect(s.mode).toBe('replaying');
    expect(s.current).toBe(trace.states[0]);
    expect(s.log).toEqual([]);
    for (let i = 0; i < trace.events.length; i++) s = cpuLabReducer(s, { type: 'tick' });
    expect(s.current).toBe(trace.states.at(-1));
    expect(s.log).toHaveLength(trace.events.length);
    s = cpuLabReducer(s, { type: 'tick' });
    expect(s.mode).toBe('idle');
  });

  it('load replaces the machine', () => {
    const other = createCpu([{ op: 'HLT', arg: 0 }]);
    const s = cpuLabReducer(cpuLabReducer(lab(), { type: 'step' }), { type: 'load', cpu: other });
    expect(s.initial).toBe(other);
    expect(s.current).toBe(other);
    expect(s.log).toEqual([]);
  });

  it('keeps the visible log bounded', () => {
    let s = createCpuLabState(createCpu([{ op: 'JMP', arg: 0 }]));
    for (let i = 0; i < 200; i++) s = cpuLabReducer(s, { type: 'step' });
    expect(s.log.length).toBeLessThanOrEqual(64);
  });
});

describe('keyboard shortcuts', () => {
  const key = (k: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}, tag = 'BUTTON') =>
    keyToCpuCommand({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...extra }, tag);

  it('maps letters to commands', () => {
    expect(key('s')).toBe('step');
    expect(key('p')).toBe('toggle-run');
    expect(key('r')).toBe('reset');
    expect(key('R', { shiftKey: true })).toBe('replay');
  });

  it('ignores modified keys and typing in form fields', () => {
    expect(key('s', { ctrlKey: true })).toBeNull();
    expect(key('r', { metaKey: true })).toBeNull();
    expect(key('s', {}, 'TEXTAREA')).toBeNull();
    expect(key('s', {}, 'INPUT')).toBeNull();
    expect(key('x')).toBeNull();
  });
});
