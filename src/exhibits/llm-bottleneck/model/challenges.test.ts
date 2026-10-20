import { describe, expect, it } from 'vitest';
import { WORKED_EXAMPLE, type LlmConfig } from './bottleneck';
import { CHALLENGES, checkChallenge } from './challenges';

const cfg = (patch: Partial<LlmConfig> = {}): LlmConfig => ({ ...WORKED_EXAMPLE, ...patch });

describe('challenges', () => {
  it('defines two challenges with prompts and hints', () => {
    expect(CHALLENGES.map((c) => c.id)).toEqual(['cross-ridge', 'fit-memory']);
    for (const c of CHALLENGES) {
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.prompt.length).toBeGreaterThan(0);
      expect(c.hint.length).toBeGreaterThan(0);
    }
  });

  describe('cross-ridge: make decode compute-bound at ≥ 4096 tokens of context, ≥ 7B parameters', () => {
    it('is unsolved for the worked example', () => {
      const r = checkChallenge('cross-ridge', cfg());
      expect(r.solved).toBe(false);
      expect(r.detail).toMatch(/1\.00 FLOP\/byte/);
      expect(r.detail).toMatch(/156/);
    });

    it('stays unsolved when only batch is raised (full multi-head KV)', () => {
      expect(checkChallenge('cross-ridge', cfg({ batch: 1024 })).solved).toBe(false);
    });

    it('is solved by sharing KV heads and batching', () => {
      expect(checkChallenge('cross-ridge', cfg({ kvHeads: 1, batch: 512 })).solved).toBe(true);
    });

    it('does not accept shortcuts that break the rules', () => {
      expect(checkChallenge('cross-ridge', cfg({ context: 128, batch: 1024 })).solved).toBe(false);
      expect(checkChallenge('cross-ridge', cfg({ paramsB: 1, kvHeads: 1, batch: 1024 })).solved).toBe(false);
      expect(checkChallenge('cross-ridge', cfg({ peakTflops: 1 })).solved).toBe(false);
    });
  });

  describe('fit-memory: batch ≥ 32 at ≥ 4096 tokens within 80 GB, ≥ 7B parameters', () => {
    it('is unsolved at full MHA 16-bit KV with batch 32', () => {
      const r = checkChallenge('fit-memory', cfg({ batch: 32 }));
      expect(r.solved).toBe(false);
      expect(r.detail).toMatch(/82\.7 GB/);
    });

    it('needs batch ≥ 32', () => {
      expect(checkChallenge('fit-memory', cfg()).solved).toBe(false);
    });

    it('is solved by grouped-query attention or lower precision', () => {
      expect(checkChallenge('fit-memory', cfg({ batch: 32, kvHeads: 8 })).solved).toBe(true);
      expect(checkChallenge('fit-memory', cfg({ batch: 32, bytesPerParam: 1 })).solved).toBe(true);
    });

    it('rejects shrinking the context or the model', () => {
      expect(checkChallenge('fit-memory', cfg({ batch: 32, context: 2048 })).solved).toBe(false);
      expect(checkChallenge('fit-memory', cfg({ batch: 32, paramsB: 1 })).solved).toBe(false);
    });
  });
});
