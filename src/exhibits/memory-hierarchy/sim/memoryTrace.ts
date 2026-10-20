/**
 * A pure, deterministic model of one load request travelling down a simplified
 * memory hierarchy (CPU → L1 → L2 → RAM) and back.
 *
 * RAM is the final level of the routine lookup. Storage (SSD/NVMe) is not a cache
 * level: data reaches RAM from storage only when the operating system handles a
 * page fault, which is modelled separately by buildPageFaultPath().
 *
 * The trace is at most MAX_TRACE_STEPS fixed steps, so it is computed synchronously
 * on the main thread — no worker is needed for this bounded explanatory timeline.
 */

export type MemoryLevel = 'CPU' | 'L1' | 'L2' | 'RAM';
export type TraceAction = 'request' | 'lookup' | 'fetch' | 'return' | 'deliver';
export type TraceDirection = 'down' | 'up';
export type LookupOutcome = 'hit' | 'miss';

export interface MemoryTraceConfig {
  /** Whether the requested cache line is present in L1. */
  l1Hit: boolean;
  /** Whether the line is present in L2. Ignored when L1 hits. */
  l2Hit: boolean;
  /** Illustrative access latencies, in whole nanoseconds. */
  l1LatencyNs: number;
  l2LatencyNs: number;
  ramLatencyNs: number;
}

export interface TraceStep {
  index: number;
  level: MemoryLevel;
  action: TraceAction;
  direction: TraceDirection;
  /** Only present on cache lookups. */
  outcome?: LookupOutcome;
  label: string;
  /** Latency charged at this step (only lookups and the RAM fetch cost time). */
  latencyNs: number;
  /** Running total including this step. */
  cumulativeNs: number;
}

export interface MemoryTrace {
  config: MemoryTraceConfig;
  steps: TraceStep[];
  servedBy: Exclude<MemoryLevel, 'CPU'>;
  totalLatencyNs: number;
  latenciesAreIllustrative: true;
  note: string;
}

export interface LatencyBounds {
  min: number;
  max: number;
}

/** Longest routine trace: CPU, L1, L2, RAM, L2, L1, CPU. */
export const MAX_TRACE_STEPS = 7;

/** Illustrative round numbers in nanoseconds, roughly in the range of a modern desktop CPU. */
export const DEFAULT_LATENCIES_NS = { l1: 1, l2: 4, ram: 80 } as const;

export const LATENCY_BOUNDS_NS: Readonly<Record<'l1' | 'l2' | 'ram', LatencyBounds>> = {
  l1: { min: 1, max: 10 },
  l2: { min: 2, max: 40 },
  ram: { min: 30, max: 300 },
};

export const LATENCY_NOTE =
  'Latencies are illustrative round numbers in nanoseconds. Real values vary with the processor, its clock speed, ' +
  'the memory modules and the access pattern, and depend on details this model leaves out.';

export const DEFAULT_TRACE_CONFIG: MemoryTraceConfig = {
  l1Hit: true,
  l2Hit: false,
  l1LatencyNs: DEFAULT_LATENCIES_NS.l1,
  l2LatencyNs: DEFAULT_LATENCIES_NS.l2,
  ramLatencyNs: DEFAULT_LATENCIES_NS.ram,
};

function latency(raw: unknown, fallback: number, { min, max }: LatencyBounds): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

function flag(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

/** Coerce arbitrary input into a valid config: wrong types fall back to defaults, numbers are clamped and rounded. */
export function sanitizeTraceConfig(input: unknown): MemoryTraceConfig {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_TRACE_CONFIG;
  return {
    l1Hit: flag(raw.l1Hit, d.l1Hit),
    l2Hit: flag(raw.l2Hit, d.l2Hit),
    l1LatencyNs: latency(raw.l1LatencyNs, d.l1LatencyNs, LATENCY_BOUNDS_NS.l1),
    l2LatencyNs: latency(raw.l2LatencyNs, d.l2LatencyNs, LATENCY_BOUNDS_NS.l2),
    ramLatencyNs: latency(raw.ramLatencyNs, d.ramLatencyNs, LATENCY_BOUNDS_NS.ram),
  };
}

type StepDraft = Omit<TraceStep, 'index' | 'cumulativeNs'>;

export function buildMemoryTrace(input: MemoryTraceConfig): MemoryTrace {
  const config = sanitizeTraceConfig(input);
  const { l1Hit, l1LatencyNs, l2LatencyNs, ramLatencyNs } = config;
  // L2 is never consulted when L1 hits, so its flag must not influence the result.
  const l2Hit = l1Hit ? true : config.l2Hit;
  const servedBy: MemoryTrace['servedBy'] = l1Hit ? 'L1' : l2Hit ? 'L2' : 'RAM';

  const drafts: StepDraft[] = [
    { level: 'CPU', action: 'request', direction: 'down', label: 'CPU issues a load for an address', latencyNs: 0 },
    l1Hit
      ? { level: 'L1', action: 'lookup', direction: 'down', outcome: 'hit', label: 'L1 cache hit — the line is already here', latencyNs: l1LatencyNs }
      : { level: 'L1', action: 'lookup', direction: 'down', outcome: 'miss', label: 'L1 cache miss — ask L2', latencyNs: l1LatencyNs },
  ];
  if (!l1Hit) {
    drafts.push(
      l2Hit
        ? { level: 'L2', action: 'lookup', direction: 'down', outcome: 'hit', label: 'L2 cache hit — the line is found in L2', latencyNs: l2LatencyNs }
        : { level: 'L2', action: 'lookup', direction: 'down', outcome: 'miss', label: 'L2 cache miss — go to main memory', latencyNs: l2LatencyNs },
    );
    if (!l2Hit) {
      drafts.push(
        { level: 'RAM', action: 'fetch', direction: 'down', label: 'Main memory (RAM) supplies the cache line', latencyNs: ramLatencyNs },
        { level: 'L2', action: 'return', direction: 'up', label: 'Line is filled into L2 on the way up', latencyNs: 0 },
      );
    }
    drafts.push({ level: 'L1', action: 'return', direction: 'up', label: 'Line is filled into L1 on the way up', latencyNs: 0 });
  }
  drafts.push({ level: 'CPU', action: 'deliver', direction: 'up', label: `CPU receives the data from ${servedBy}`, latencyNs: 0 });

  let running = 0;
  const steps = drafts.map((draft, index): TraceStep => {
    running += draft.latencyNs;
    return { index, ...draft, cumulativeNs: running };
  });

  return {
    config: { ...config, l2Hit },
    steps,
    servedBy,
    totalLatencyNs: running,
    latenciesAreIllustrative: true,
    note: LATENCY_NOTE,
  };
}

/* ── Page fault: a separate, explicitly labelled illustration ─────────── */

export type PageFaultLevel = 'CPU' | 'MMU' | 'OS' | 'Storage' | 'RAM';

export interface PageFaultStep {
  level: PageFaultLevel;
  label: string;
}

export interface PageFaultPath {
  kind: 'page-fault';
  isRoutineCacheMiss: false;
  summary: string;
  steps: PageFaultStep[];
}

/** Not a cache level: how data enters RAM from storage, via the operating system. Timing is deliberately not modelled. */
export function buildPageFaultPath(): PageFaultPath {
  return {
    kind: 'page-fault',
    isRoutineCacheMiss: false,
    summary:
      'A page fault happens when the page holding an address is not currently mapped in RAM. The CPU stops the ' +
      'instruction and the operating system (OS) takes over: it finds a free frame, asks the storage device to read ' +
      'the page, updates the page table and then lets the instruction retry. This is OS-handled I/O, not the next ' +
      'step after an ordinary cache miss.',
    steps: [
      { level: 'CPU', label: 'Address translation finds no valid page-table entry' },
      { level: 'MMU', label: 'The memory-management unit raises a page-fault exception' },
      { level: 'OS', label: 'The OS page-fault handler picks a free RAM frame and starts I/O' },
      { level: 'Storage', label: 'The SSD/NVMe device reads the page (OS-driven I/O)' },
      { level: 'RAM', label: 'The page is copied into RAM and the page table is updated' },
      { level: 'CPU', label: 'The faulting instruction retries and takes the routine path' },
    ],
  };
}
