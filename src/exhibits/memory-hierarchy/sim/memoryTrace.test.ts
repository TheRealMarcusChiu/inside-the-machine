import { describe, expect, it } from 'vitest';
import {
  buildMemoryTrace,
  buildPageFaultPath,
  DEFAULT_LATENCIES_NS,
  DEFAULT_TRACE_CONFIG,
  LATENCY_BOUNDS_NS,
  LATENCY_NOTE,
  MAX_TRACE_STEPS,
  sanitizeTraceConfig,
  type MemoryTraceConfig,
} from './memoryTrace';

function config(overrides: Partial<MemoryTraceConfig> = {}): MemoryTraceConfig {
  return { l1Hit: false, l2Hit: false, l1LatencyNs: 1, l2LatencyNs: 4, ramLatencyNs: 80, ...overrides };
}

const ALL_HIT_COMBOS: Array<Pick<MemoryTraceConfig, 'l1Hit' | 'l2Hit'>> = [
  { l1Hit: true, l2Hit: true },
  { l1Hit: true, l2Hit: false },
  { l1Hit: false, l2Hit: true },
  { l1Hit: false, l2Hit: false },
];

describe('memory request trace: path through the hierarchy', () => {
  it('serves an L1 hit from L1 and returns straight to the CPU', () => {
    const trace = buildMemoryTrace(config({ l1Hit: true }));
    expect(trace.steps.map((s) => s.level)).toEqual(['CPU', 'L1', 'CPU']);
    expect(trace.servedBy).toBe('L1');
  });

  it('ignores the L2 setting when L1 hits (L2 is never consulted)', () => {
    const a = buildMemoryTrace(config({ l1Hit: true, l2Hit: true }));
    const b = buildMemoryTrace(config({ l1Hit: true, l2Hit: false }));
    expect(a).toEqual(b);
    expect(a.steps.some((s) => s.level === 'L2')).toBe(false);
  });

  it('on an L1 miss consults L2, and an L2 hit returns upward through L1', () => {
    const trace = buildMemoryTrace(config({ l1Hit: false, l2Hit: true }));
    expect(trace.steps.map((s) => s.level)).toEqual(['CPU', 'L1', 'L2', 'L1', 'CPU']);
    expect(trace.servedBy).toBe('L2');
  });

  it('on an L2 miss proceeds to RAM, then returns upward through L2 and L1', () => {
    const trace = buildMemoryTrace(config({ l1Hit: false, l2Hit: false }));
    expect(trace.steps.map((s) => s.level)).toEqual(['CPU', 'L1', 'L2', 'RAM', 'L2', 'L1', 'CPU']);
    expect(trace.servedBy).toBe('RAM');
  });

  it('always begins with a CPU request and ends with the CPU receiving the data', () => {
    for (const hits of ALL_HIT_COMBOS) {
      const { steps } = buildMemoryTrace(config(hits));
      expect(steps[0]).toMatchObject({ level: 'CPU', action: 'request' });
      expect(steps[steps.length - 1]).toMatchObject({ level: 'CPU', action: 'deliver' });
    }
  });

  it('marks each cache lookup as a hit or miss, and the outbound/return direction of every step', () => {
    const { steps } = buildMemoryTrace(config({ l1Hit: false, l2Hit: false }));
    expect(steps.map((s) => s.action)).toEqual(['request', 'lookup', 'lookup', 'fetch', 'return', 'return', 'deliver']);
    expect(steps[1]).toMatchObject({ level: 'L1', outcome: 'miss' });
    expect(steps[2]).toMatchObject({ level: 'L2', outcome: 'miss' });
    expect(steps.map((s) => s.direction)).toEqual(['down', 'down', 'down', 'down', 'up', 'up', 'up']);

    const l2Hit = buildMemoryTrace(config({ l1Hit: false, l2Hit: true })).steps;
    expect(l2Hit[1]).toMatchObject({ level: 'L1', outcome: 'miss' });
    expect(l2Hit[2]).toMatchObject({ level: 'L2', outcome: 'hit' });

    const l1Hit = buildMemoryTrace(config({ l1Hit: true })).steps;
    expect(l1Hit[1]).toMatchObject({ level: 'L1', outcome: 'hit' });
  });

  it('numbers steps sequentially from zero', () => {
    for (const hits of ALL_HIT_COMBOS) {
      const { steps } = buildMemoryTrace(config(hits));
      expect(steps.map((s) => s.index)).toEqual(steps.map((_, i) => i));
      expect(steps.length).toBeLessThanOrEqual(MAX_TRACE_STEPS);
    }
    expect(MAX_TRACE_STEPS).toBe(7);
  });

  it('is deterministic: the same configuration always yields the same trace', () => {
    for (const hits of ALL_HIT_COMBOS) {
      expect(buildMemoryTrace(config(hits))).toEqual(buildMemoryTrace(config(hits)));
    }
  });

  it('is pure: does not mutate its input', () => {
    const input = config({ l2Hit: true });
    const snapshot = { ...input };
    buildMemoryTrace(input);
    expect(input).toEqual(snapshot);
  });
});

describe('memory request trace: labelled steps', () => {
  it('gives every step a non-empty, human-readable label', () => {
    for (const hits of ALL_HIT_COMBOS) {
      for (const step of buildMemoryTrace(config(hits)).steps) {
        expect(typeof step.label).toBe('string');
        expect(step.label.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('labels cache lookups with their level and outcome', () => {
    const { steps } = buildMemoryTrace(config({ l1Hit: false, l2Hit: true }));
    expect(steps[1]!.label).toMatch(/L1/);
    expect(steps[1]!.label).toMatch(/miss/i);
    expect(steps[2]!.label).toMatch(/L2/);
    expect(steps[2]!.label).toMatch(/hit/i);
  });

  it('labels the RAM step as a main-memory access', () => {
    const ram = buildMemoryTrace(config()).steps.find((s) => s.level === 'RAM');
    expect(ram?.label).toMatch(/RAM|main memory/i);
  });
});

describe('memory request trace: modelled latency', () => {
  it('charges an L1 hit only the L1 latency', () => {
    const trace = buildMemoryTrace(config({ l1Hit: true, l1LatencyNs: 2 }));
    expect(trace.totalLatencyNs).toBe(2);
  });

  it('charges an L2 hit the L1 and L2 latencies', () => {
    const trace = buildMemoryTrace(config({ l1Hit: false, l2Hit: true, l1LatencyNs: 1, l2LatencyNs: 5 }));
    expect(trace.totalLatencyNs).toBe(6);
  });

  it('charges a RAM access the L1, L2 and RAM latencies', () => {
    const trace = buildMemoryTrace(config({ l1LatencyNs: 1, l2LatencyNs: 4, ramLatencyNs: 100 }));
    expect(trace.totalLatencyNs).toBe(105);
  });

  it('attributes latency to the consulted level and none to request/return/deliver steps', () => {
    const { steps } = buildMemoryTrace(config({ l1LatencyNs: 3, l2LatencyNs: 7, ramLatencyNs: 90 }));
    expect(steps.map((s) => s.latencyNs)).toEqual([0, 3, 7, 90, 0, 0, 0]);
  });

  it('tracks a running cumulative latency that ends at the total', () => {
    for (const hits of ALL_HIT_COMBOS) {
      const trace = buildMemoryTrace(config(hits));
      let running = 0;
      for (const step of trace.steps) {
        running += step.latencyNs;
        expect(step.cumulativeNs).toBe(running);
      }
      expect(trace.steps[trace.steps.length - 1]!.cumulativeNs).toBe(trace.totalLatencyNs);
    }
  });

  it('reflects visitor-configured RAM latency', () => {
    const fast = buildMemoryTrace(config({ ramLatencyNs: 50 }));
    const slow = buildMemoryTrace(config({ ramLatencyNs: 200 }));
    expect(slow.totalLatencyNs - fast.totalLatencyNs).toBe(150);
  });
});

describe('latency defaults are illustrative inputs, not universal claims', () => {
  it('exposes defaults as plain configurable inputs, ordered fastest to slowest', () => {
    expect(DEFAULT_LATENCIES_NS.l1).toBeGreaterThan(0);
    expect(DEFAULT_LATENCIES_NS.l1).toBeLessThan(DEFAULT_LATENCIES_NS.l2);
    expect(DEFAULT_LATENCIES_NS.l2).toBeLessThan(DEFAULT_LATENCIES_NS.ram);
    expect(DEFAULT_TRACE_CONFIG).toMatchObject({
      l1LatencyNs: DEFAULT_LATENCIES_NS.l1,
      l2LatencyNs: DEFAULT_LATENCIES_NS.l2,
      ramLatencyNs: DEFAULT_LATENCIES_NS.ram,
    });
  });

  it('keeps every default within its configurable bounds', () => {
    expect(DEFAULT_LATENCIES_NS.l1).toBeGreaterThanOrEqual(LATENCY_BOUNDS_NS.l1.min);
    expect(DEFAULT_LATENCIES_NS.l1).toBeLessThanOrEqual(LATENCY_BOUNDS_NS.l1.max);
    expect(DEFAULT_LATENCIES_NS.l2).toBeGreaterThanOrEqual(LATENCY_BOUNDS_NS.l2.min);
    expect(DEFAULT_LATENCIES_NS.l2).toBeLessThanOrEqual(LATENCY_BOUNDS_NS.l2.max);
    expect(DEFAULT_LATENCIES_NS.ram).toBeGreaterThanOrEqual(LATENCY_BOUNDS_NS.ram.min);
    expect(DEFAULT_LATENCIES_NS.ram).toBeLessThanOrEqual(LATENCY_BOUNDS_NS.ram.max);
  });

  it('describes latencies as illustrative and hardware-dependent', () => {
    expect(LATENCY_NOTE).toMatch(/illustrative/i);
    expect(LATENCY_NOTE).toMatch(/var(y|ies)|depend/i);
    expect(LATENCY_NOTE).not.toMatch(/\b(always|exactly|every (cpu|computer))\b/i);
  });

  it('flags every trace as using illustrative latencies and carries the note', () => {
    for (const hits of ALL_HIT_COMBOS) {
      const trace = buildMemoryTrace(config(hits));
      expect(trace.latenciesAreIllustrative).toBe(true);
      expect(trace.note).toBe(LATENCY_NOTE);
    }
  });
});

describe('SSD/NVMe storage is a separate page-fault path, never a routine cache-miss level', () => {
  it('never includes storage in a routine cache-miss trace', () => {
    for (const hits of ALL_HIT_COMBOS) {
      const trace = buildMemoryTrace(config(hits));
      for (const step of trace.steps) {
        expect(['CPU', 'L1', 'L2', 'RAM']).toContain(step.level);
        expect(step.label).not.toMatch(/SSD|NVMe|disk|storage/i);
      }
    }
  });

  it('treats RAM as the last level of the routine path, even with the slowest RAM setting', () => {
    const trace = buildMemoryTrace(config({ ramLatencyNs: LATENCY_BOUNDS_NS.ram.max }));
    const outbound = trace.steps.filter((s) => s.direction === 'down');
    expect(outbound[outbound.length - 1]!.level).toBe('RAM');
  });

  it('offers storage only via an explicitly labelled page-fault explanation', () => {
    const path = buildPageFaultPath();
    expect(path.kind).toBe('page-fault');
    expect(path.isRoutineCacheMiss).toBe(false);
    expect(path.steps.length).toBeGreaterThan(0);
    expect(path.steps.some((s) => s.level === 'Storage')).toBe(true);
    const storage = path.steps.find((s) => s.level === 'Storage')!;
    expect(storage.label).toMatch(/SSD|NVMe/);
    expect(path.summary).toMatch(/page fault/i);
    expect(path.summary).toMatch(/operating system|OS/);
  });

  it('keeps the page-fault path out of the routine trace object', () => {
    const trace = buildMemoryTrace(config());
    expect(JSON.stringify(trace)).not.toMatch(/Storage|SSD|NVMe/);
  });
});

describe('sanitizeTraceConfig', () => {
  it('returns the default config for empty or garbage input', () => {
    expect(sanitizeTraceConfig({})).toEqual(DEFAULT_TRACE_CONFIG);
    expect(sanitizeTraceConfig(null)).toEqual(DEFAULT_TRACE_CONFIG);
    expect(sanitizeTraceConfig('l1Hit=1')).toEqual(DEFAULT_TRACE_CONFIG);
  });

  it('keeps valid values', () => {
    const valid = config({ l1Hit: true, l2Hit: false, l1LatencyNs: 2, l2LatencyNs: 10, ramLatencyNs: 120 });
    expect(sanitizeTraceConfig(valid)).toEqual(valid);
  });

  it('falls back to defaults for non-boolean hit flags', () => {
    const s = sanitizeTraceConfig({ l1Hit: 'yes', l2Hit: 1 });
    expect(s.l1Hit).toBe(DEFAULT_TRACE_CONFIG.l1Hit);
    expect(s.l2Hit).toBe(DEFAULT_TRACE_CONFIG.l2Hit);
  });

  it('falls back to defaults for non-finite or non-numeric latencies', () => {
    const s = sanitizeTraceConfig({ l1LatencyNs: Number.NaN, l2LatencyNs: Infinity, ramLatencyNs: '80' });
    expect(s.l1LatencyNs).toBe(DEFAULT_LATENCIES_NS.l1);
    expect(s.l2LatencyNs).toBe(DEFAULT_LATENCIES_NS.l2);
    expect(s.ramLatencyNs).toBe(DEFAULT_LATENCIES_NS.ram);
  });

  it('clamps out-of-range latencies into bounds and rounds to whole nanoseconds', () => {
    const s = sanitizeTraceConfig({ l1LatencyNs: -5, l2LatencyNs: 1e9, ramLatencyNs: 99.6 });
    expect(s.l1LatencyNs).toBe(LATENCY_BOUNDS_NS.l1.min);
    expect(s.l2LatencyNs).toBe(LATENCY_BOUNDS_NS.l2.max);
    expect(s.ramLatencyNs).toBe(100);
  });

  it('is applied by buildMemoryTrace so tampered input cannot produce negative or NaN totals', () => {
    const trace = buildMemoryTrace({
      l1Hit: false,
      l2Hit: false,
      l1LatencyNs: -100,
      l2LatencyNs: Number.NaN,
      ramLatencyNs: -1,
    });
    expect(Number.isFinite(trace.totalLatencyNs)).toBe(true);
    for (const step of trace.steps) expect(step.latencyNs).toBeGreaterThanOrEqual(0);
    expect(trace.totalLatencyNs).toBe(LATENCY_BOUNDS_NS.l1.min + DEFAULT_LATENCIES_NS.l2 + LATENCY_BOUNDS_NS.ram.min);
  });
});
