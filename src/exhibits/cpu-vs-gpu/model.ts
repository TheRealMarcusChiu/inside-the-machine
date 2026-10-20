/**
 * An educational cost model of data-parallel execution, not a cycle-accurate simulator.
 *
 * The same loop body runs once per lane (work item). Lane i follows branch path
 * (i % divergence). Each machine groups consecutive lanes and issues one instruction
 * stream per group:
 * - the CPU packs lanes into SIMD vectors of CPU_SIMD_WIDTH and masks inactive lanes;
 * - the GPU packs lanes into warps of `warpWidth` and runs them SIMT, also with masks.
 * A group executes each distinct path its lanes take one after another. Groups run one
 * after another too, so the trace reads as a single timeline per machine.
 */

export type Regularity = 'regular' | 'irregular';
export type Unit = 'cpu' | 'gpu';
export type StepKind = 'compute' | 'memory' | 'transfer';

export interface Workload {
  /** Number of independent work items (array elements). */
  lanes: number;
  /** GPU warp width: lanes that share one instruction stream. */
  warpWidth: number;
  /** Number of distinct branch paths; lane i takes path i % divergence. */
  divergence: number;
  /** Regular: neighbouring lanes touch neighbouring addresses. Irregular: scattered addresses. */
  regularity: Regularity;
  /** Whether the GPU must copy inputs in from host memory and results back out. */
  transfer: boolean;
}

export interface TraceStep {
  kind: StepKind;
  /** Vector or warp index; null for whole-job transfers. */
  group: number | null;
  /** Branch path being executed; null for memory and transfer steps. */
  path: number | null;
  /** Lanes doing useful work during this step. */
  activeLanes: number[];
  cycles: number;
  note: string;
}

export interface UnitTrace {
  label: 'CPU SIMD' | 'GPU SIMT';
  /** Lanes per vector (CPU) or warp (GPU). */
  groupWidth: number;
  steps: TraceStep[];
  computeCycles: number;
  memoryCycles: number;
  transferCycles: number;
  totalCycles: number;
}

export interface Trace {
  /** The workload actually modelled, after clamping. */
  workload: Workload;
  cpu: UnitTrace;
  gpu: UnitTrace;
}

/** Four 32-bit lanes: one 128-bit SSE / NEON register. */
export const CPU_SIMD_WIDTH = 4;
export const MAX_LANES = 64;
export const MAX_WARP_WIDTH = 32;
export const MAX_PATHS = 4;

/** Modelled costs, in abstract cycles. */
export const COSTS = {
  /** One vector instruction sequence for one path on a fast, out-of-order CPU core. */
  cpuPath: 2,
  /** One warp instruction sequence for one path; GPU cores are simpler and clocked lower. */
  gpuPath: 3,
  /** Scattered access: one separate memory transaction per lane, on either machine. */
  gatherPerLane: 1,
  /** Fixed cost of starting one host ↔ device copy (driver call, bus latency). */
  transferLatency: 8,
  /** Cost per element moved across the bus, each way. */
  transferPerLane: 1,
} as const;

export const DEFAULT_WORKLOAD: Workload = {
  lanes: 16,
  warpWidth: 8,
  divergence: 1,
  regularity: 'regular',
  transfer: false,
};

export const PATH_NAMES = ['A', 'B', 'C', 'D'] as const;
export const pathName = (path: number) => PATH_NAMES[path] ?? String(path);

const clampInt = (n: number, min: number, max: number) =>
  Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min;

export function clampWorkload(w: Workload): Workload {
  return {
    lanes: clampInt(w.lanes, 1, MAX_LANES),
    warpWidth: clampInt(w.warpWidth, 1, MAX_WARP_WIDTH),
    divergence: clampInt(w.divergence, 1, MAX_PATHS),
    regularity: w.regularity === 'irregular' ? 'irregular' : 'regular',
    transfer: w.transfer === true,
  };
}

const range = (start: number, end: number) => Array.from({ length: end - start }, (_, i) => start + i);
const span = (lanes: number[]) =>
  lanes.length === 1 ? `lane ${lanes[0]}` : `lanes ${lanes[0]}–${lanes[lanes.length - 1]}`;

function buildUnit(unit: Unit, w: Workload): UnitTrace {
  const width = unit === 'cpu' ? CPU_SIMD_WIDTH : w.warpWidth;
  const noun = unit === 'cpu' ? 'Vector' : 'Warp';
  const pathCost = unit === 'cpu' ? COSTS.cpuPath : COSTS.gpuPath;
  const steps: TraceStep[] = [];
  const transferCost = COSTS.transferLatency + COSTS.transferPerLane * w.lanes;

  if (unit === 'gpu' && w.transfer) {
    steps.push({
      kind: 'transfer',
      group: null,
      path: null,
      activeLanes: [],
      cycles: transferCost,
      note: `Copy ${w.lanes} inputs from host memory to the GPU before the kernel can start.`,
    });
  }

  for (let group = 0; group * width < w.lanes; group++) {
    const lanes = range(group * width, Math.min(w.lanes, (group + 1) * width));
    if (w.regularity === 'irregular') {
      steps.push({
        kind: 'memory',
        group,
        path: null,
        activeLanes: lanes,
        cycles: COSTS.gatherPerLane * lanes.length,
        note: `${noun} ${group} waits while ${lanes.length} scattered addresses are fetched one at a time.`,
      });
    }
    const paths = [...new Set(lanes.map((lane) => lane % w.divergence))].sort((a, b) => a - b);
    for (const path of paths) {
      const active = lanes.filter((lane) => lane % w.divergence === path);
      const idle = width - active.length;
      steps.push({
        kind: 'compute',
        group,
        path,
        activeLanes: active,
        cycles: pathCost,
        note:
          idle === 0
            ? `${noun} ${group} runs path ${pathName(path)} on ${span(active)}: all ${width} lanes busy.`
            : `${noun} ${group} runs path ${pathName(path)}: ${active.length} of ${width} lanes busy, ${idle} masked off or empty.`,
      });
    }
  }

  if (unit === 'gpu' && w.transfer) {
    steps.push({
      kind: 'transfer',
      group: null,
      path: null,
      activeLanes: [],
      cycles: transferCost,
      note: `Copy ${w.lanes} results from the GPU back to host memory.`,
    });
  }

  const total = (kind: StepKind) => steps.filter((s) => s.kind === kind).reduce((t, s) => t + s.cycles, 0);
  const computeCycles = total('compute');
  const memoryCycles = total('memory');
  const transferCycles = total('transfer');
  return {
    label: unit === 'cpu' ? 'CPU SIMD' : 'GPU SIMT',
    groupWidth: width,
    steps,
    computeCycles,
    memoryCycles,
    transferCycles,
    totalCycles: computeCycles + memoryCycles + transferCycles,
  };
}

/** Pure: the same workload always yields an identical trace. */
export function buildTrace(workload: Workload): Trace {
  const w = clampWorkload(workload);
  return { workload: w, cpu: buildUnit('cpu', w), gpu: buildUnit('gpu', w) };
}

/* ── Playback ─────────────────────────────────────────────────────────── */

/** Both timelines advance together: position N shows the first N steps of each. */
export interface Playback {
  trace: Trace;
  position: number;
}

export const traceLength = (trace: Trace) => Math.max(trace.cpu.steps.length, trace.gpu.steps.length);

export function createPlayback(trace: Trace): Playback {
  return { trace, position: 0 };
}

export function isFinished(p: Playback): boolean {
  return p.position >= traceLength(p.trace);
}

export function stepPlayback(p: Playback): Playback {
  return isFinished(p) ? p : { trace: p.trace, position: p.position + 1 };
}

export function resetPlayback(p: Playback): Playback {
  return createPlayback(p.trace);
}

export function visibleSteps(p: Playback, unit: Unit): TraceStep[] {
  return p.trace[unit].steps.slice(0, p.position);
}

/** The step a unit is executing at this position, or undefined before the start or after it has finished. */
export function currentStep(p: Playback, unit: Unit): TraceStep | undefined {
  return p.position > 0 ? p.trace[unit].steps[p.position - 1] : undefined;
}

export function elapsedCycles(p: Playback, unit: Unit): number {
  return visibleSteps(p, unit).reduce((t, s) => t + s.cycles, 0);
}

/* ── Challenge ────────────────────────────────────────────────────────── */

export function cpuWins(trace: Trace): boolean {
  return trace.cpu.totalCycles < trace.gpu.totalCycles;
}
