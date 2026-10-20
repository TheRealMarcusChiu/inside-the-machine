/**
 * Back-of-envelope cost model for one transformer forward step.
 *
 * Every function here is a deliberately simple estimate: it counts the big matrix
 * products and the bytes that must cross the memory bus at least once, and nothing
 * else. Results are upper bounds on speed (lower bounds on time) for an ideal
 * machine — never benchmarks. Units are SI base units: FLOP, bytes, seconds.
 */

export type Phase = 'decode' | 'prefill';
export type Bound = 'memory' | 'compute';

export interface LlmConfig {
  /** Parameter count, in billions. */
  paramsB: number;
  /** Bytes per stored number (weights and KV cache alike). */
  bytesPerParam: number;
  layers: number;
  /** Query heads, H. */
  heads: number;
  /** Key/value heads, Hkv (= H for multi-head, 1 for multi-query, between for grouped-query). */
  kvHeads: number;
  headDim: number;
  /** Tokens already in context, T. */
  context: number;
  /** Independent sequences processed together, B. */
  batch: number;
  /** Peak dense compute, in TFLOP/s (10¹² FLOP/s). */
  peakTflops: number;
  /** Peak memory bandwidth, in TB/s (10¹² bytes/s). */
  bandwidthTBs: number;
}

/** Defaults: a 7B-parameter, Llama-2-7B-shaped model on an illustrative data-centre accelerator. */
export const WORKED_EXAMPLE: LlmConfig = {
  paramsB: 7,
  bytesPerParam: 2,
  layers: 32,
  heads: 32,
  kvHeads: 32,
  headDim: 128,
  context: 4096,
  batch: 1,
  peakTflops: 312,
  bandwidthTBs: 2,
};

const TERA = 1e12;
const BILLION = 1e9;

/** Raw weights = P × b. */
export function weightBytes(paramCount: number, bytes: number): number {
  return paramCount * bytes;
}

/** Simplified KV cache for one sequence = 2 × L × T × Hkv × dh × b (one K and one V vector per layer, token, KV head). */
export function kvCacheBytesPerSequence(a: {
  layers: number;
  context: number;
  kvHeads: number;
  headDim: number;
  bytes: number;
}): number {
  return 2 * a.layers * a.context * a.kvHeads * a.headDim * a.bytes;
}

interface AttentionShape {
  layers: number;
  batch: number;
  context: number;
  heads: number;
  headDim: number;
}

/** Decode: one new query per sequence against T cached keys (QKᵀ) and values (AV), 2 FLOPs per multiply–add. */
export function attentionFlopsDecode(a: AttentionShape): number {
  return 4 * a.layers * a.batch * a.context * a.heads * a.headDim;
}

/** Prefill: T queries against up to T keys; the causal mask halves the full 4·L·B·T²·H·dh. */
export function attentionFlopsPrefill(a: AttentionShape): number {
  return 2 * a.layers * a.batch * a.context * a.context * a.heads * a.headDim;
}

/** Arithmetic intensity at which the bandwidth slope meets the compute roof. */
export function ridgePoint(peakFlopsPerSecond: number, bytesPerSecond: number): number {
  return peakFlopsPerSecond / bytesPerSecond;
}

/** Roofline (Williams, Waterman & Patterson 2009): attainable = min(peak compute, bandwidth × AI). */
export function roofline(peakFlopsPerSecond: number, bytesPerSecond: number, intensity: number): number {
  return Math.min(peakFlopsPerSecond, bytesPerSecond * intensity);
}

export interface PhaseEstimate {
  phase: Phase;
  weightBytes: number;
  /** KV cache bytes per sequence at the current context. */
  kvBytes: number;
  /** 2 FLOPs per parameter per token: the weight matrix products. */
  matmulFlops: number;
  attentionFlops: number;
  flops: number;
  bytes: number;
  /** FLOP per byte of memory traffic. */
  intensity: number;
  ridge: number;
  bound: Bound;
  attainableFlopsPerSecond: number;
  computeSeconds: number;
  memorySeconds: number;
  /** max(compute time, memory time): no real step can be faster. */
  timeLowerBoundSeconds: number;
  /** Tokens produced (decode) or ingested (prefill) by one step. */
  tokensPerStep: number;
  tokensPerSecondUpperBound: number;
}

/**
 * One forward step.
 * - decode: each of B sequences adds one token; weights are read once and shared by the batch,
 *   and every sequence reads its own KV cache.
 * - prefill: each of B sequences ingests T prompt tokens; weights are read once and the KV cache is
 *   written once. Activations and the T × T score matrix are assumed to stay on chip (as in FlashAttention).
 */
export function estimatePhase(c: LlmConfig, phase: Phase): PhaseEstimate {
  const params = c.paramsB * BILLION;
  const peak = c.peakTflops * TERA;
  const bw = c.bandwidthTBs * TERA;
  const wBytes = weightBytes(params, c.bytesPerParam);
  const kvBytes = kvCacheBytesPerSequence({
    layers: c.layers,
    context: c.context,
    kvHeads: c.kvHeads,
    headDim: c.headDim,
    bytes: c.bytesPerParam,
  });
  const shape = { layers: c.layers, batch: c.batch, context: c.context, heads: c.heads, headDim: c.headDim };
  const tokensPerStep = phase === 'decode' ? c.batch : c.batch * c.context;
  const matmulFlops = 2 * params * tokensPerStep;
  const attentionFlops = phase === 'decode' ? attentionFlopsDecode(shape) : attentionFlopsPrefill(shape);
  const flops = matmulFlops + attentionFlops;
  const bytes = wBytes + c.batch * kvBytes;
  const intensity = flops / bytes;
  const ridge = ridgePoint(peak, bw);
  const computeSeconds = flops / peak;
  const memorySeconds = bytes / bw;
  const timeLowerBoundSeconds = Math.max(computeSeconds, memorySeconds);
  return {
    phase,
    weightBytes: wBytes,
    kvBytes,
    matmulFlops,
    attentionFlops,
    flops,
    bytes,
    intensity,
    ridge,
    bound: intensity < ridge ? 'memory' : 'compute',
    attainableFlopsPerSecond: roofline(peak, bw, intensity),
    computeSeconds,
    memorySeconds,
    timeLowerBoundSeconds,
    tokensPerStep,
    tokensPerSecondUpperBound: tokensPerStep / timeLowerBoundSeconds,
  };
}

/** Weights plus every sequence's KV cache: the memory that must be resident. */
export function footprintBytes(c: LlmConfig): number {
  return (
    weightBytes(c.paramsB * BILLION, c.bytesPerParam) +
    c.batch *
      kvCacheBytesPerSequence({
        layers: c.layers,
        context: c.context,
        kvHeads: c.kvHeads,
        headDim: c.headDim,
        bytes: c.bytesPerParam,
      })
  );
}

/** Make a configuration self-consistent, explaining any adjustment. */
export function normaliseConfig(c: LlmConfig): { config: LlmConfig; notes: string[] } {
  const notes: string[] = [];
  let kvHeads = c.kvHeads;
  if (kvHeads > c.heads) {
    kvHeads = c.heads;
    notes.push(
      `KV heads (${c.kvHeads}) cannot exceed query heads (${c.heads}), so they are clamped to ${c.heads} in the estimate.`,
    );
  } else if (c.heads % kvHeads !== 0) {
    notes.push(
      `Grouped-query attention normally needs KV heads to divide query heads evenly; ${kvHeads} does not divide ${c.heads}. The formulas still run.`,
    );
  }
  return { config: kvHeads === c.kvHeads ? c : { ...c, kvHeads }, notes };
}

export interface TimelineFrame {
  index: number;
  context: number;
  generatedTokens: number;
  elapsedSeconds: number;
  secondsPerStep: number;
  intensity: number;
  bound: Bound;
  kvBytesTotal: number;
}

/**
 * Decode a generation in chunks: frame k sits at context T + k·tokensPerFrame. Each chunk is
 * charged at its starting context (a simple left-endpoint rule), so the time is a lower bound.
 */
export function decodeTimeline(c: LlmConfig, frames: number, tokensPerFrame: number): TimelineFrame[] {
  const out: TimelineFrame[] = [];
  let elapsed = 0;
  for (let k = 0; k <= frames; k++) {
    const context = c.context + k * tokensPerFrame;
    const e = estimatePhase({ ...c, context }, 'decode');
    out.push({
      index: k,
      context,
      generatedTokens: k * tokensPerFrame * c.batch,
      elapsedSeconds: elapsed,
      secondsPerStep: e.timeLowerBoundSeconds,
      intensity: e.intensity,
      bound: e.bound,
      kvBytesTotal: c.batch * e.kvBytes,
    });
    elapsed += tokensPerFrame * e.timeLowerBoundSeconds;
  }
  return out;
}
