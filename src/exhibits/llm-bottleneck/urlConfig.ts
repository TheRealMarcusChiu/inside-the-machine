import { codecs, readState, writeState, type ParamCodec, type StateSchema } from '../../lib/url/urlState';
import { WORKED_EXAMPLE, type LlmConfig, type Phase } from './model/bottleneck';

export type Depth = 'short' | 'deep';

/** Everything a visitor can share about this exhibit via its URL. */
export interface LlmUrlState extends LlmConfig {
  depth: Depth;
  phase: Phase;
}

export type NumericField = Exclude<keyof LlmConfig, 'bytesPerParam'>;

export interface Limit {
  min: number;
  max: number;
  /** Whole numbers only. */
  integer: boolean;
}

/** Accepted ranges. Generous, but finite, so a tampered link cannot produce absurd output. */
export const LIMITS: Record<NumericField, Limit> = {
  paramsB: { min: 0.01, max: 10000, integer: false },
  layers: { min: 1, max: 1000, integer: true },
  heads: { min: 1, max: 1024, integer: true },
  kvHeads: { min: 1, max: 1024, integer: true },
  headDim: { min: 1, max: 4096, integer: true },
  context: { min: 1, max: 10_000_000, integer: true },
  batch: { min: 1, max: 65536, integer: true },
  peakTflops: { min: 0.001, max: 1_000_000, integer: false },
  bandwidthTBs: { min: 0.001, max: 10_000, integer: false },
};

export const PRECISIONS = [
  { bytes: 4, label: 'FP32 · 4 bytes' },
  { bytes: 2, label: '16-bit · 2 bytes' },
  { bytes: 1, label: '8-bit · 1 byte' },
  { bytes: 0.5, label: '4-bit · 0.5 bytes' },
] as const;

/** Plain decimal numbers only (no exponents, signs or "Infinity"), within a range. */
function decimal(min: number, max: number): ParamCodec<number> {
  return {
    parse(raw) {
      if (raw === null || !/^\d+(\.\d+)?$/.test(raw)) return undefined;
      const n = Number(raw);
      return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
    },
    serialize: (n) => String(n),
  };
}

function precision(): ParamCodec<number> {
  return {
    parse: (raw) => PRECISIONS.find((p) => String(p.bytes) === raw)?.bytes,
    serialize: (n) => String(n),
  };
}

function numeric(field: NumericField): ParamCodec<number> {
  const { min, max, integer } = LIMITS[field];
  return integer ? codecs.int(min, max) : decimal(min, max);
}

const schema: StateSchema<LlmUrlState> = {
  depth: { key: 'depth', codec: codecs.oneOf(['short', 'deep'] as const), default: 'short' },
  phase: { key: 'phase', codec: codecs.oneOf(['decode', 'prefill'] as const), default: 'decode' },
  paramsB: { key: 'p', codec: numeric('paramsB'), default: WORKED_EXAMPLE.paramsB },
  bytesPerParam: { key: 'b', codec: precision(), default: WORKED_EXAMPLE.bytesPerParam },
  layers: { key: 'L', codec: numeric('layers'), default: WORKED_EXAMPLE.layers },
  heads: { key: 'H', codec: numeric('heads'), default: WORKED_EXAMPLE.heads },
  kvHeads: { key: 'kv', codec: numeric('kvHeads'), default: WORKED_EXAMPLE.kvHeads },
  headDim: { key: 'dh', codec: numeric('headDim'), default: WORKED_EXAMPLE.headDim },
  context: { key: 'T', codec: numeric('context'), default: WORKED_EXAMPLE.context },
  batch: { key: 'B', codec: numeric('batch'), default: WORKED_EXAMPLE.batch },
  peakTflops: { key: 'tf', codec: numeric('peakTflops'), default: WORKED_EXAMPLE.peakTflops },
  bandwidthTBs: { key: 'bw', codec: numeric('bandwidthTBs'), default: WORKED_EXAMPLE.bandwidthTBs },
};

export const DEFAULT_LLM_STATE: LlmUrlState = readState(schema, new URLSearchParams());

export function readLlmState(params: URLSearchParams): LlmUrlState {
  return readState(schema, params);
}

export function writeLlmState(state: LlmUrlState, base?: URLSearchParams): URLSearchParams {
  return writeState(schema, state, base);
}

export function toConfig(s: LlmUrlState): LlmConfig {
  return {
    paramsB: s.paramsB,
    bytesPerParam: s.bytesPerParam,
    layers: s.layers,
    heads: s.heads,
    kvHeads: s.kvHeads,
    headDim: s.headDim,
    context: s.context,
    batch: s.batch,
    peakTflops: s.peakTflops,
    bandwidthTBs: s.bandwidthTBs,
  };
}

/** Parse a typed value for a field, or explain why it is not acceptable. */
export function parseFieldInput(field: NumericField, raw: string): { value: number } | { error: string } {
  const { min, max, integer } = LIMITS[field];
  const range = `Enter a ${integer ? 'whole number' : 'number'} between ${min.toLocaleString('en-US')} and ${max.toLocaleString('en-US')}.`;
  const trimmed = raw.trim();
  if (!/^\d*\.?\d+$|^\d+\.$/.test(trimmed)) return { error: range };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) return { error: range };
  return { value: n };
}

/** Halve or double a value, rounding and clamping to the field's limits. */
export function scaleField(field: NumericField, value: number, factor: number): number {
  const { min, max, integer } = LIMITS[field];
  const raw = value * factor;
  const v = integer ? Math.round(raw) : Number(raw.toPrecision(6));
  return Math.min(max, Math.max(min, v));
}
