import { describe, expect, it } from 'vitest';
import {
  CPU_SIMD_WIDTH,
  DEFAULT_WORKLOAD,
  buildTrace,
  createPlayback,
  elapsedCycles,
  isFinished,
  resetPlayback,
  stepPlayback,
  visibleSteps,
  type TraceStep,
  type Workload,
} from './model';

/**
 * An educational model, not a cycle-accurate simulator. Rules the tests pin down:
 * - lane i follows branch path (i % divergence);
 * - the GPU groups lanes into warps of `warpWidth` consecutive lanes (SIMT);
 * - the CPU groups lanes into vectors of CPU_SIMD_WIDTH consecutive lanes (SIMD with masks);
 * - a group executes each distinct path its lanes take one after another, masking the rest.
 */
const workload = (patch: Partial<Workload> = {}): Workload => ({
  lanes: 32,
  warpWidth: 8,
  divergence: 1,
  regularity: 'regular',
  transfer: false,
  ...patch,
});

const compute = (steps: readonly TraceStep[]) => steps.filter((s) => s.kind === 'compute');
const range = (start: number, end: number) => Array.from({ length: end - start }, (_, i) => start + i);
const sum = (steps: readonly TraceStep[]) => steps.reduce((t, s) => t + s.cycles, 0);

describe('CPU SIMD vs GPU SIMT trace model', () => {
  it('has a sensible default workload and labels both machines', () => {
    expect(DEFAULT_WORKLOAD).toMatchObject({ divergence: 1, regularity: 'regular', transfer: false });
    const trace = buildTrace(DEFAULT_WORKLOAD);
    expect(trace.cpu.label).toBe('CPU SIMD');
    expect(trace.gpu.label).toBe('GPU SIMT');
  });

  describe('regular work', () => {
    it('completes every lane of a warp together, one warp per step', () => {
      const { gpu } = buildTrace(workload());
      const steps = compute(gpu.steps);
      expect(steps).toHaveLength(4); // 32 lanes / warp width 8
      steps.forEach((step, w) => {
        expect(step.group).toBe(w);
        expect(step.activeLanes).toEqual(range(w * 8, w * 8 + 8));
      });
    });

    it('completes every lane of a CPU vector together', () => {
      const { cpu } = buildTrace(workload());
      const steps = compute(cpu.steps);
      expect(steps).toHaveLength(32 / CPU_SIMD_WIDTH);
      steps.forEach((step, v) => {
        expect(step.activeLanes).toEqual(range(v * CPU_SIMD_WIDTH, (v + 1) * CPU_SIMD_WIDTH));
      });
    });

    it('covers every lane exactly once', () => {
      const { cpu, gpu } = buildTrace(workload({ lanes: 20 }));
      for (const unit of [cpu, gpu]) {
        const lanes = compute(unit.steps).flatMap((s) => s.activeLanes);
        expect([...lanes].sort((a, b) => a - b)).toEqual(range(0, 20));
      }
    });

    it('leaves the tail of a partial warp inactive', () => {
      const { gpu } = buildTrace(workload({ lanes: 12, warpWidth: 8 }));
      const steps = compute(gpu.steps);
      expect(steps).toHaveLength(2);
      expect(steps[1]!.activeLanes).toEqual(range(8, 12));
    });
  });

  describe('branch divergence', () => {
    it('serialises the distinct paths taken within a warp', () => {
      const { gpu } = buildTrace(workload({ lanes: 8, warpWidth: 8, divergence: 2 }));
      const steps = compute(gpu.steps);
      expect(steps).toHaveLength(2);
      expect(steps.map((s) => s.path)).toEqual([0, 1]);
      expect(steps[0]!.activeLanes).toEqual([0, 2, 4, 6]);
      expect(steps[1]!.activeLanes).toEqual([1, 3, 5, 7]);
    });

    it('only ever activates lanes of one warp and one path per step', () => {
      const { gpu } = buildTrace(workload({ lanes: 32, warpWidth: 8, divergence: 3 }));
      for (const step of compute(gpu.steps)) {
        for (const lane of step.activeLanes) {
          expect(Math.floor(lane / 8)).toBe(step.group);
          expect(lane % 3).toBe(step.path);
        }
      }
    });

    it('multiplies compute time by the number of distinct paths per warp', () => {
      const one = buildTrace(workload({ divergence: 1 })).gpu;
      const four = buildTrace(workload({ divergence: 4 })).gpu;
      expect(four.computeCycles).toBe(one.computeCycles * 4);
      expect(four.totalCycles).toBeGreaterThan(one.totalCycles);
    });

    it('does not serialise paths a warp never takes', () => {
      // Two lanes with four possible paths: only paths 0 and 1 actually occur.
      const { gpu } = buildTrace(workload({ lanes: 2, warpWidth: 4, divergence: 4 }));
      expect(compute(gpu.steps).map((s) => s.path)).toEqual([0, 1]);
    });

    it('masks both sides of a branch on the CPU too', () => {
      const { cpu } = buildTrace(workload({ lanes: 16, divergence: 2 }));
      const steps = compute(cpu.steps);
      expect(steps).toHaveLength((16 / CPU_SIMD_WIDTH) * 2);
      for (const step of steps) for (const lane of step.activeLanes) expect(lane % 2).toBe(step.path);
    });
  });

  describe('memory access regularity', () => {
    it('adds modelled delay for irregular (uncoalesced / gathered) access', () => {
      const regular = buildTrace(workload({ regularity: 'regular' }));
      const irregular = buildTrace(workload({ regularity: 'irregular' }));
      expect(irregular.gpu.memoryCycles).toBeGreaterThan(regular.gpu.memoryCycles);
      expect(irregular.cpu.memoryCycles).toBeGreaterThan(regular.cpu.memoryCycles);
      expect(irregular.gpu.totalCycles).toBeGreaterThan(regular.gpu.totalCycles);
      expect(irregular.gpu.computeCycles).toBe(regular.gpu.computeCycles);
    });

    it('shows the delay as memory steps in the trace', () => {
      const { gpu } = buildTrace(workload({ regularity: 'irregular' }));
      const memory = gpu.steps.filter((s) => s.kind === 'memory');
      expect(memory.length).toBeGreaterThan(0);
      expect(sum(memory)).toBe(gpu.memoryCycles);
    });
  });

  describe('host ↔ device transfer', () => {
    it('adds transfer time to the GPU total only', () => {
      const off = buildTrace(workload({ transfer: false }));
      const on = buildTrace(workload({ transfer: true }));
      expect(off.gpu.transferCycles).toBe(0);
      expect(on.gpu.transferCycles).toBeGreaterThan(0);
      expect(on.gpu.totalCycles).toBe(off.gpu.totalCycles + on.gpu.transferCycles);
      expect(on.cpu.totalCycles).toBe(off.cpu.totalCycles);
      expect(on.cpu.transferCycles).toBe(0);
    });

    it('copies data in before the kernel and results out after it', () => {
      const { gpu } = buildTrace(workload({ transfer: true }));
      expect(gpu.steps[0]!.kind).toBe('transfer');
      expect(gpu.steps.at(-1)!.kind).toBe('transfer');
      expect(buildTrace(workload()).gpu.steps.some((s) => s.kind === 'transfer')).toBe(false);
    });

    it('scales transfer cost with the amount of data', () => {
      const small = buildTrace(workload({ lanes: 8, transfer: true })).gpu.transferCycles;
      const large = buildTrace(workload({ lanes: 64, transfer: true })).gpu.transferCycles;
      expect(large).toBeGreaterThan(small);
    });
  });

  describe('totals and determinism', () => {
    it('totals are the sum of their parts and of their steps', () => {
      const trace = buildTrace(workload({ divergence: 2, regularity: 'irregular', transfer: true }));
      for (const unit of [trace.cpu, trace.gpu]) {
        expect(unit.totalCycles).toBe(unit.computeCycles + unit.memoryCycles + unit.transferCycles);
        expect(unit.totalCycles).toBe(sum(unit.steps));
        for (const step of unit.steps) {
          expect(step.cycles).toBeGreaterThan(0);
          expect(step.note.length).toBeGreaterThan(0);
        }
      }
    });

    it('is a pure function of the workload', () => {
      const w = workload({ divergence: 3, regularity: 'irregular', transfer: true });
      const snapshot = structuredClone(w);
      expect(buildTrace(w)).toEqual(buildTrace(w));
      expect(w).toEqual(snapshot);
    });

    it('clamps out-of-range workloads instead of throwing', () => {
      const trace = buildTrace(workload({ lanes: -5, warpWidth: 0, divergence: 99 }));
      expect(trace.gpu.totalCycles).toBeGreaterThan(0);
      expect(trace.cpu.totalCycles).toBeGreaterThan(0);
    });
  });
});

describe('trace playback', () => {
  const trace = buildTrace(workload({ divergence: 2, transfer: true }));
  const length = Math.max(trace.cpu.steps.length, trace.gpu.steps.length);

  it('starts before the first step', () => {
    const p = createPlayback(trace);
    expect(p.position).toBe(0);
    expect(visibleSteps(p, 'gpu')).toEqual([]);
    expect(elapsedCycles(p, 'gpu')).toBe(0);
    expect(isFinished(p)).toBe(false);
  });

  it('stepping returns a new playback and leaves the old one untouched', () => {
    const p0 = createPlayback(trace);
    const p1 = stepPlayback(p0);
    expect(p1).not.toBe(p0);
    expect(p0.position).toBe(0);
    expect(p1.position).toBe(1);
    expect(p1.trace).toBe(trace);
    expect(visibleSteps(p1, 'gpu')).toEqual(trace.gpu.steps.slice(0, 1));
    expect(elapsedCycles(p1, 'gpu')).toBe(trace.gpu.steps[0]!.cycles);
  });

  it('finishes at the end of the longer trace and then stays put', () => {
    let p = createPlayback(trace);
    for (let i = 0; i < length; i++) p = stepPlayback(p);
    expect(isFinished(p)).toBe(true);
    expect(elapsedCycles(p, 'cpu')).toBe(trace.cpu.totalCycles);
    expect(elapsedCycles(p, 'gpu')).toBe(trace.gpu.totalCycles);
    expect(stepPlayback(p)).toBe(p);
  });

  it('reset returns to the start of the same trace', () => {
    const done = stepPlayback(stepPlayback(createPlayback(trace)));
    const again = resetPlayback(done);
    expect(again.position).toBe(0);
    expect(again.trace).toBe(trace);
    expect(done.position).toBe(2);
  });

  it('replays identically', () => {
    const run = () => {
      const seen: TraceStep[][] = [];
      let p = createPlayback(trace);
      while (!isFinished(p)) {
        p = stepPlayback(p);
        seen.push([...visibleSteps(p, 'cpu'), ...visibleSteps(p, 'gpu')]);
      }
      return seen;
    };
    const first = run();
    expect(first).toHaveLength(length);
    expect(run()).toEqual(first);
  });
});
