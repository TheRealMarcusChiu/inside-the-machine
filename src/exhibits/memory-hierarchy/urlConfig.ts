import { codecs, readState, writeState, type StateSchema } from '../../lib/url/urlState';
import {
  buildMemoryTrace,
  DEFAULT_TRACE_CONFIG,
  LATENCY_BOUNDS_NS,
  type MemoryTraceConfig,
} from './sim/memoryTrace';

export type Depth = 'short' | 'deep';

/** Everything a visitor can share about this exhibit via its URL. */
export interface MemoryExhibitUrlState {
  depth: Depth;
  l1Hit: boolean;
  l2Hit: boolean;
  /** Whole nanoseconds, within LATENCY_BOUNDS_NS. */
  l1Latency: number;
  l2Latency: number;
  ramLatency: number;
  /** Current step of the request trace, clamped to the trace the configuration produces. */
  step: number;
}

const schema: StateSchema<MemoryExhibitUrlState> = {
  depth: { key: 'depth', codec: codecs.oneOf(['short', 'deep'] as const), default: 'short' },
  l1Hit: { key: 'l1Hit', codec: codecs.bool(), default: DEFAULT_TRACE_CONFIG.l1Hit },
  l2Hit: { key: 'l2Hit', codec: codecs.bool(), default: DEFAULT_TRACE_CONFIG.l2Hit },
  l1Latency: {
    key: 'l1Latency',
    codec: codecs.int(LATENCY_BOUNDS_NS.l1.min, LATENCY_BOUNDS_NS.l1.max),
    default: DEFAULT_TRACE_CONFIG.l1LatencyNs,
  },
  l2Latency: {
    key: 'l2Latency',
    codec: codecs.int(LATENCY_BOUNDS_NS.l2.min, LATENCY_BOUNDS_NS.l2.max),
    default: DEFAULT_TRACE_CONFIG.l2LatencyNs,
  },
  ramLatency: {
    key: 'ramLatency',
    codec: codecs.int(LATENCY_BOUNDS_NS.ram.min, LATENCY_BOUNDS_NS.ram.max),
    default: DEFAULT_TRACE_CONFIG.ramLatencyNs,
  },
  step: { key: 'step', codec: codecs.int(0, Number.MAX_SAFE_INTEGER), default: 0 },
};

export function traceConfigFromState(state: MemoryExhibitUrlState): MemoryTraceConfig {
  return {
    l1Hit: state.l1Hit,
    l2Hit: state.l2Hit,
    l1LatencyNs: state.l1Latency,
    l2LatencyNs: state.l2Latency,
    ramLatencyNs: state.ramLatency,
  };
}

/** Index of the final step for this configuration's trace. */
export function lastStepFor(state: MemoryExhibitUrlState): number {
  return buildMemoryTrace(traceConfigFromState(state)).steps.length - 1;
}

function clampStep(state: MemoryExhibitUrlState): MemoryExhibitUrlState {
  const step = Math.min(Math.max(0, Math.trunc(state.step) || 0), lastStepFor(state));
  return step === state.step ? state : { ...state, step };
}

export const DEFAULT_MEMORY_EXHIBIT_STATE: MemoryExhibitUrlState = clampStep(readState(schema, new URLSearchParams()));

export function readMemoryExhibitState(params: URLSearchParams): MemoryExhibitUrlState {
  return clampStep(readState(schema, params));
}

/** Writes onto a copy of `base`, so unrelated parameters (route, motion, section anchor) are preserved. */
export function writeMemoryExhibitState(state: MemoryExhibitUrlState, base?: URLSearchParams): URLSearchParams {
  return writeState(schema, clampStep(state), base);
}
