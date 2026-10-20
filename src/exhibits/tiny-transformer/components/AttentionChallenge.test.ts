import { describe, expect, it } from 'vitest';
import { DEFAULT_K, DEFAULT_Q, DEFAULT_V } from '../math';
import { checkChallenge } from './AttentionChallenge';

const withQ1 = (q1: number[]) => [q1, ...DEFAULT_Q.slice(1)];

describe('attention challenge', () => {
  it('is unsolved for the worked example', () => {
    const r = checkChallenge(DEFAULT_Q, DEFAULT_K, DEFAULT_V);
    expect(r.solved).toBe(false);
    expect(r.share).toBeCloseTo(0.1863237, 6);
  });

  it('accepts the query given in the reasoning', () => {
    const r = checkChallenge(withQ1([-2, 4, -2, 4]), DEFAULT_K, DEFAULT_V);
    expect(r.solved).toBe(true);
    expect(r.share).toBeGreaterThanOrEqual(0.9);
  });

  it('rejects a merely aligned query that also feeds key 3', () => {
    expect(checkChallenge(withQ1([0, 3, 0, 3]), DEFAULT_K, DEFAULT_V).solved).toBe(false);
  });

  it('does not count a solution reached by editing K or V', () => {
    const K = [DEFAULT_K[0]!, [0, 10, 0, 10], DEFAULT_K[2]!];
    expect(checkChallenge(withQ1([0, 3, 0, 3]), K, DEFAULT_V).solved).toBe(false);
  });
});
