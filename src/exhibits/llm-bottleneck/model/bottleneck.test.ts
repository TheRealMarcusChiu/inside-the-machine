import { describe, expect, it } from 'vitest';
import {
  attentionFlopsDecode,
  attentionFlopsPrefill,
  decodeTimeline,
  estimatePhase,
  footprintBytes,
  kvCacheBytesPerSequence,
  normaliseConfig,
  ridgePoint,
  roofline,
  WORKED_EXAMPLE,
  weightBytes,
  type LlmConfig,
} from './bottleneck';

const cfg = (patch: Partial<LlmConfig> = {}): LlmConfig => ({ ...WORKED_EXAMPLE, ...patch });

/** Relative closeness, since the quantities span many orders of magnitude. */
function expectNear(actual: number, expected: number, rel = 1e-9) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * rel);
}

describe('raw weight bytes: P × b', () => {
  it('multiplies parameter count by bytes per parameter', () => {
    expect(weightBytes(7e9, 2)).toBe(14e9);
    expect(weightBytes(70e9, 0.5)).toBe(35e9);
    expect(weightBytes(1, 4)).toBe(4);
  });
});

describe('simplified KV cache: 2 × L × T × Hkv × dh × b', () => {
  it('counts one K and one V vector per layer, token and KV head', () => {
    // 2 · 32 · 4096 · 32 · 128 · 2 = 2 GiB
    expect(kvCacheBytesPerSequence({ layers: 32, context: 4096, kvHeads: 32, headDim: 128, bytes: 2 })).toBe(
      2 * 1024 ** 3,
    );
  });

  it('is linear in every factor', () => {
    const base = { layers: 2, context: 3, kvHeads: 5, headDim: 7, bytes: 1 };
    const one = kvCacheBytesPerSequence(base);
    expect(one).toBe(2 * 2 * 3 * 5 * 7);
    expect(kvCacheBytesPerSequence({ ...base, context: 6 })).toBe(2 * one);
    expect(kvCacheBytesPerSequence({ ...base, kvHeads: 10 })).toBe(2 * one);
    expect(kvCacheBytesPerSequence({ ...base, bytes: 0.5 })).toBe(one / 2);
  });

  it('shrinks by H / Hkv under grouped-query attention', () => {
    const mha = kvCacheBytesPerSequence({ layers: 32, context: 8192, kvHeads: 32, headDim: 128, bytes: 2 });
    const gqa = kvCacheBytesPerSequence({ layers: 32, context: 8192, kvHeads: 8, headDim: 128, bytes: 2 });
    expect(mha / gqa).toBe(4);
  });
});

describe('back-of-envelope attention products', () => {
  it('decode: QKᵀ and AV against T cached tokens, 2 FLOPs per multiply–add → 4·L·B·T·H·dh', () => {
    expect(attentionFlopsDecode({ layers: 32, batch: 1, context: 4096, heads: 32, headDim: 128 })).toBe(
      4 * 32 * 4096 * 32 * 128,
    );
    expect(attentionFlopsDecode({ layers: 1, batch: 3, context: 10, heads: 2, headDim: 4 })).toBe(4 * 3 * 10 * 2 * 4);
  });

  it('prefill: causal mask halves the full 4·L·B·T²·H·dh → 2·L·B·T²·H·dh', () => {
    expect(attentionFlopsPrefill({ layers: 1, batch: 1, context: 10, heads: 2, headDim: 4 })).toBe(2 * 100 * 2 * 4);
    const t = attentionFlopsPrefill({ layers: 1, batch: 1, context: 1000, heads: 1, headDim: 1 });
    expect(attentionFlopsPrefill({ layers: 1, batch: 1, context: 2000, heads: 1, headDim: 1 })).toBe(4 * t);
  });
});

describe('Roofline: attainable = min(peak compute, bandwidth × arithmetic intensity)', () => {
  it('follows the bandwidth slope below the ridge and the flat roof above it', () => {
    const peak = 100e12;
    const bw = 1e12;
    expect(ridgePoint(peak, bw)).toBe(100);
    expect(roofline(peak, bw, 10)).toBe(10e12);
    expect(roofline(peak, bw, 100)).toBe(100e12);
    expect(roofline(peak, bw, 1000)).toBe(100e12);
  });

  it('is zero at zero intensity and never exceeds the peak', () => {
    expect(roofline(5, 1, 0)).toBe(0);
    for (const ai of [0.01, 1, 4.9, 5, 5.1, 1e6]) expect(roofline(5, 1, ai)).toBeLessThanOrEqual(5);
  });
});

describe('worked example: 7B parameters, 16-bit, 32 layers, 32 KV heads, dh 128, 4096 tokens', () => {
  it('uses the documented defaults', () => {
    expect(WORKED_EXAMPLE).toEqual({
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
    });
  });

  it('decode at batch 1 has intensity ≈ 1 FLOP/byte and is bandwidth-bound', () => {
    const e = estimatePhase(cfg(), 'decode');
    expect(e.weightBytes).toBe(14e9);
    expect(e.kvBytes).toBe(2 * 1024 ** 3);
    expect(e.matmulFlops).toBe(14e9);
    expect(e.attentionFlops).toBe(2 * 1024 ** 3);
    expect(e.flops).toBe(14e9 + 2 * 1024 ** 3);
    expect(e.bytes).toBe(14e9 + 2 * 1024 ** 3);
    expectNear(e.intensity, 1);
    expect(e.ridge).toBe(156);
    expect(e.bound).toBe('memory');
    expectNear(e.attainableFlopsPerSecond, 2e12);
    expectNear(e.memorySeconds, (14e9 + 2 * 1024 ** 3) / 2e12);
    expectNear(e.computeSeconds, (14e9 + 2 * 1024 ** 3) / 312e12);
    expect(e.timeLowerBoundSeconds).toBe(e.memorySeconds);
    expect(e.tokensPerStep).toBe(1);
    expectNear(e.tokensPerSecondUpperBound, 1 / e.memorySeconds);
    expect(Math.round(e.tokensPerSecondUpperBound)).toBe(124);
  });

  it('prefill of the same 4096-token prompt is compute-bound', () => {
    const e = estimatePhase(cfg(), 'prefill');
    expect(e.matmulFlops).toBe(2 * 7e9 * 4096);
    expect(e.attentionFlops).toBe(2 * 32 * 4096 ** 2 * 32 * 128);
    expect(e.bytes).toBe(14e9 + 2 * 1024 ** 3);
    expect(e.bound).toBe('compute');
    expect(e.intensity).toBeGreaterThan(3000);
    expect(e.timeLowerBoundSeconds).toBe(e.computeSeconds);
    expect(e.tokensPerStep).toBe(4096);
    expectNear(e.attainableFlopsPerSecond, 312e12);
  });
});

describe('decode is not always bandwidth-bound', () => {
  it('batching raises intensity because weights are read once per step for the whole batch', () => {
    const b1 = estimatePhase(cfg({ context: 128 }), 'decode');
    const b256 = estimatePhase(cfg({ context: 128, batch: 256 }), 'decode');
    expect(b256.intensity).toBeGreaterThan(b1.intensity * 50);
  });

  it('short context, large batch decode can cross the ridge and become compute-bound', () => {
    const e = estimatePhase(cfg({ context: 128, batch: 1024 }), 'decode');
    expect(e.bound).toBe('compute');
  });

  it('with full multi-head KV at long context, batching alone saturates far below the ridge', () => {
    const e = estimatePhase(cfg({ batch: 1024 }), 'decode');
    expect(e.bound).toBe('memory');
    expect(e.intensity).toBeLessThan(10);
  });

  it('a slow-compute, high-bandwidth machine makes even batch-1 decode compute-bound', () => {
    const e = estimatePhase(cfg({ peakTflops: 1, bandwidthTBs: 10 }), 'decode');
    expect(e.bound).toBe('compute');
  });
});

describe('footprint and normalisation', () => {
  it('footprint = weights + batch × KV cache', () => {
    expect(footprintBytes(cfg({ batch: 3 }))).toBe(14e9 + 3 * 2 * 1024 ** 3);
  });

  it('clamps KV heads to query heads and explains why', () => {
    const { config, notes } = normaliseConfig(cfg({ heads: 8, kvHeads: 32 }));
    expect(config.kvHeads).toBe(8);
    expect(notes.join(' ')).toMatch(/kv heads/i);
    expect(normaliseConfig(cfg()).notes).toEqual([]);
  });

  it('flags head counts that do not divide evenly into groups', () => {
    const { config, notes } = normaliseConfig(cfg({ heads: 32, kvHeads: 5 }));
    expect(config.kvHeads).toBe(5);
    expect(notes.join(' ')).toMatch(/divide/i);
  });
});

describe('decode timeline (replay)', () => {
  it('advances the context frame by frame and accumulates a lower-bound time', () => {
    const frames = decodeTimeline(cfg(), 4, 512);
    expect(frames).toHaveLength(5);
    expect(frames.map((f) => f.context)).toEqual([4096, 4608, 5120, 5632, 6144]);
    expect(frames[0]!.generatedTokens).toBe(0);
    expect(frames[0]!.elapsedSeconds).toBe(0);
    expect(frames[4]!.generatedTokens).toBe(2048);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]!.elapsedSeconds).toBeGreaterThan(frames[i - 1]!.elapsedSeconds);
      expect(frames[i]!.kvBytesTotal).toBeGreaterThan(frames[i - 1]!.kvBytesTotal);
      expect(frames[i]!.secondsPerStep).toBeGreaterThan(frames[i - 1]!.secondsPerStep);
    }
  });

  it('charges each chunk at its starting context (simple left-endpoint rule)', () => {
    const frames = decodeTimeline(cfg(), 1, 512);
    const first = estimatePhase(cfg(), 'decode');
    expectNear(frames[1]!.elapsedSeconds, 512 * first.timeLowerBoundSeconds);
  });

  it('counts generated tokens across the whole batch', () => {
    const frames = decodeTimeline(cfg({ batch: 4 }), 2, 100);
    expect(frames[2]!.generatedTokens).toBe(800);
  });
});
