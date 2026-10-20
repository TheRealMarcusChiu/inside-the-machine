import { describe, expect, it } from 'vitest';
import { buildMemoryTrace, DEFAULT_LATENCIES_NS, LATENCY_BOUNDS_NS } from './sim/memoryTrace';
import {
  DEFAULT_MEMORY_EXHIBIT_STATE,
  readMemoryExhibitState,
  traceConfigFromState,
  writeMemoryExhibitState,
  type MemoryExhibitUrlState,
} from './urlConfig';

const SHARED: MemoryExhibitUrlState = {
  depth: 'deep',
  l1Hit: false,
  l2Hit: true,
  l1Latency: 2,
  l2Latency: 9,
  ramLatency: 150,
  step: 3,
};

describe('memory-hierarchy URL configuration', () => {
  it('defaults to the short tour at step 0 with the illustrative default latencies', () => {
    expect(DEFAULT_MEMORY_EXHIBIT_STATE).toMatchObject({
      depth: 'short',
      step: 0,
      l1Latency: DEFAULT_LATENCIES_NS.l1,
      l2Latency: DEFAULT_LATENCIES_NS.l2,
      ramLatency: DEFAULT_LATENCIES_NS.ram,
    });
    expect(typeof DEFAULT_MEMORY_EXHIBIT_STATE.l1Hit).toBe('boolean');
    expect(typeof DEFAULT_MEMORY_EXHIBIT_STATE.l2Hit).toBe('boolean');
    expect(readMemoryExhibitState(new URLSearchParams())).toEqual(DEFAULT_MEMORY_EXHIBIT_STATE);
  });

  it('restores a shared configuration from its URL parameters', () => {
    const s = readMemoryExhibitState(
      new URLSearchParams('depth=deep&l1Hit=0&l2Hit=1&l1Latency=2&l2Latency=9&ramLatency=150&step=3'),
    );
    expect(s).toEqual(SHARED);
  });

  it('round-trips depth, l1Hit, l2Hit, l1Latency, l2Latency, ramLatency and step', () => {
    expect(readMemoryExhibitState(writeMemoryExhibitState(SHARED))).toEqual(SHARED);

    const variants: MemoryExhibitUrlState[] = [
      { ...DEFAULT_MEMORY_EXHIBIT_STATE, depth: 'deep' },
      { ...DEFAULT_MEMORY_EXHIBIT_STATE, l1Hit: !DEFAULT_MEMORY_EXHIBIT_STATE.l1Hit, step: 0 },
      { ...DEFAULT_MEMORY_EXHIBIT_STATE, l1Hit: false, l2Hit: !DEFAULT_MEMORY_EXHIBIT_STATE.l2Hit, step: 0 },
      { ...DEFAULT_MEMORY_EXHIBIT_STATE, l1Latency: LATENCY_BOUNDS_NS.l1.max },
      { ...DEFAULT_MEMORY_EXHIBIT_STATE, l2Latency: LATENCY_BOUNDS_NS.l2.min },
      { ...DEFAULT_MEMORY_EXHIBIT_STATE, ramLatency: LATENCY_BOUNDS_NS.ram.max },
      { ...DEFAULT_MEMORY_EXHIBIT_STATE, l1Hit: false, l2Hit: false, step: 6 },
    ];
    for (const state of variants) {
      expect(readMemoryExhibitState(writeMemoryExhibitState(state))).toEqual(state);
    }
  });

  it('uses the documented parameter names', () => {
    const params = writeMemoryExhibitState(SHARED);
    expect(params.get('depth')).toBe('deep');
    expect(params.get('l1Hit')).toBe('0');
    expect(params.get('l2Hit')).toBe('1');
    expect(params.get('l1Latency')).toBe('2');
    expect(params.get('l2Latency')).toBe('9');
    expect(params.get('ramLatency')).toBe('150');
    expect(params.get('step')).toBe('3');
  });

  it('writes nothing for the default state', () => {
    expect(writeMemoryExhibitState(DEFAULT_MEMORY_EXHIBIT_STATE).toString()).toBe('');
  });

  it('preserves unrelated parameters such as the motion preference', () => {
    const params = writeMemoryExhibitState(SHARED, new URLSearchParams('motion=reduce'));
    expect(params.get('motion')).toBe('reduce');
    expect(readMemoryExhibitState(params)).toEqual(SHARED);
  });

  it('converts URL state into a model config for the trace', () => {
    expect(traceConfigFromState(SHARED)).toEqual({
      l1Hit: false,
      l2Hit: true,
      l1LatencyNs: 2,
      l2LatencyNs: 9,
      ramLatencyNs: 150,
    });
    expect(buildMemoryTrace(traceConfigFromState(SHARED)).totalLatencyNs).toBe(11);
  });
});

describe('memory-hierarchy URL sanitisation', () => {
  it('ignores an unknown depth', () => {
    expect(readMemoryExhibitState(new URLSearchParams('depth=medium')).depth).toBe('short');
    expect(readMemoryExhibitState(new URLSearchParams('depth=__proto__')).depth).toBe('short');
  });

  it('accepts only 0/1 for hit flags', () => {
    for (const raw of ['true', 'yes', '2', '', 'on']) {
      const s = readMemoryExhibitState(new URLSearchParams(`l1Hit=${raw}&l2Hit=${raw}`));
      expect(s.l1Hit).toBe(DEFAULT_MEMORY_EXHIBIT_STATE.l1Hit);
      expect(s.l2Hit).toBe(DEFAULT_MEMORY_EXHIBIT_STATE.l2Hit);
    }
  });

  it('rejects malformed latencies', () => {
    for (const raw of ['NaN', 'Infinity', '-5', '3.5', '1e2', 'abc', '', '0x10']) {
      const s = readMemoryExhibitState(new URLSearchParams(`l1Latency=${raw}&l2Latency=${raw}&ramLatency=${raw}`));
      expect(s.l1Latency).toBe(DEFAULT_LATENCIES_NS.l1);
      expect(s.l2Latency).toBe(DEFAULT_LATENCIES_NS.l2);
      expect(s.ramLatency).toBe(DEFAULT_LATENCIES_NS.ram);
    }
  });

  it('rejects latencies outside the configurable bounds', () => {
    const s = readMemoryExhibitState(
      new URLSearchParams(
        `l1Latency=${LATENCY_BOUNDS_NS.l1.max + 1}&l2Latency=${LATENCY_BOUNDS_NS.l2.min - 1}&ramLatency=${LATENCY_BOUNDS_NS.ram.max + 1}`,
      ),
    );
    expect(s.l1Latency).toBe(DEFAULT_LATENCIES_NS.l1);
    expect(s.l2Latency).toBe(DEFAULT_LATENCIES_NS.l2);
    expect(s.ramLatency).toBe(DEFAULT_LATENCIES_NS.ram);
  });

  it('rejects malformed or negative steps', () => {
    for (const raw of ['-1', '1.5', 'two', '', '99999999999999999999']) {
      expect(readMemoryExhibitState(new URLSearchParams(`step=${raw}`)).step).toBe(0);
    }
  });

  it('clamps step to the last step of the trace the configuration produces', () => {
    // An L1 hit trace has 3 steps (CPU → L1 → CPU), so step 6 is past its end.
    const l1Hit = readMemoryExhibitState(new URLSearchParams('l1Hit=1&step=6'));
    expect(l1Hit.step).toBe(2);

    // An L2 hit trace has 5 steps.
    const l2Hit = readMemoryExhibitState(new URLSearchParams('l1Hit=0&l2Hit=1&step=6'));
    expect(l2Hit.step).toBe(4);

    // A RAM trace has 7 steps, so step 6 is its final step.
    const ram = readMemoryExhibitState(new URLSearchParams('l1Hit=0&l2Hit=0&step=6'));
    expect(ram.step).toBe(6);
  });

  it('never writes a step beyond the trace it describes', () => {
    const params = writeMemoryExhibitState({ ...DEFAULT_MEMORY_EXHIBIT_STATE, l1Hit: true, step: 6 });
    expect(params.get('step')).toBe('2');
  });

  it('never yields a storage/SSD step, whatever the URL says', () => {
    const s = readMemoryExhibitState(new URLSearchParams('l1Hit=0&l2Hit=0&level=SSD&step=6'));
    const trace = buildMemoryTrace(traceConfigFromState(s));
    expect(trace.steps.map((step) => step.level)).not.toContain('Storage');
    expect(s.step).toBe(trace.steps.length - 1);
  });
});
