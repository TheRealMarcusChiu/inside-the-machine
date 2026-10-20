import { describe, expect, it } from 'vitest';
import {
  DEFAULT_K,
  DEFAULT_Q,
  DEFAULT_V,
  attention,
  dot,
  scaleScores,
  softmax,
  weightedSum,
  type Matrix,
} from './math';

/** Element-wise toBeCloseTo for vectors and matrices. */
function expectVectorClose(actual: readonly number[], expected: readonly number[], digits = 5) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, digits));
}

function expectMatrixClose(actual: Matrix, expected: Matrix, digits = 5) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((row, i) => expectVectorClose(actual[i]!, row, digits));
}

const sum = (xs: readonly number[]) => xs.reduce((acc, x) => acc + x, 0);

describe('dot', () => {
  it('multiplies matching components and adds them up', () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(dot([1, 0, 1, 0], [0, 1, 0, 1])).toBe(0);
    expect(dot([-1, 2], [3, -4])).toBe(-11);
    expect(dot([0.5], [4])).toBe(2);
  });

  it('is symmetric', () => {
    expect(dot([1, 2, 3], [7, -1, 2])).toBe(dot([7, -1, 2], [1, 2, 3]));
  });

  it('rejects vectors of different lengths', () => {
    expect(() => dot([1, 2], [1, 2, 3])).toThrow(RangeError);
  });

  it('rejects empty vectors', () => {
    expect(() => dot([], [])).toThrow(RangeError);
  });

  it('rejects non-finite components', () => {
    expect(() => dot([1, Number.NaN], [1, 1])).toThrow(RangeError);
    expect(() => dot([1, 1], [Number.POSITIVE_INFINITY, 1])).toThrow(RangeError);
  });
});

describe('scaleScores', () => {
  it('divides every raw score by sqrt(dk)', () => {
    expect(scaleScores([2, 0, 1], 4)).toEqual([1, 0, 0.5]);
    expect(scaleScores([9, -3], 9)).toEqual([3, -1]);
    expectVectorClose(scaleScores([1], 2), [1 / Math.SQRT2]);
  });

  it('leaves scores unchanged when dk is 1', () => {
    expect(scaleScores([3, -2, 0.25], 1)).toEqual([3, -2, 0.25]);
  });

  it('does not mutate its input', () => {
    const raw = [4, 8];
    scaleScores(raw, 4);
    expect(raw).toEqual([4, 8]);
  });

  it('rejects a dk that is not a positive integer', () => {
    expect(() => scaleScores([1], 0)).toThrow(RangeError);
    expect(() => scaleScores([1], -4)).toThrow(RangeError);
    expect(() => scaleScores([1], 2.5)).toThrow(RangeError);
    expect(() => scaleScores([1], Number.NaN)).toThrow(RangeError);
  });

  it('rejects non-finite scores', () => {
    expect(() => scaleScores([1, Number.NaN], 4)).toThrow(RangeError);
  });
});

describe('softmax', () => {
  it('turns logits into a probability distribution', () => {
    const p = softmax([0, 1, 2]);
    expectVectorClose(p, [0.0900306, 0.2447285, 0.665241]);
    expect(sum(p)).toBeCloseTo(1, 12);
    p.forEach((x) => expect(x).toBeGreaterThan(0));
  });

  it('gives equal logits equal weight', () => {
    expectVectorClose(softmax([3, 3, 3, 3]), [0.25, 0.25, 0.25, 0.25], 12);
  });

  it('returns [1] for a single logit', () => {
    expect(softmax([42])).toEqual([1]);
  });

  it('is invariant to adding a constant to every logit', () => {
    expectVectorClose(softmax([10, 11, 12]), softmax([0, 1, 2]), 12);
  });

  it('stays finite and correct for very large logits', () => {
    const p = softmax([1000, 1001, 1002]);
    p.forEach((x) => expect(Number.isFinite(x)).toBe(true));
    expectVectorClose(p, [0.0900306, 0.2447285, 0.665241]);
    expect(sum(p)).toBeCloseTo(1, 12);

    expectVectorClose(softmax([1e6, 1e6]), [0.5, 0.5], 12);
    expectVectorClose(softmax([Number.MAX_VALUE, Number.MAX_VALUE]), [0.5, 0.5], 12);
  });

  it('stays finite and correct for very negative logits', () => {
    expectVectorClose(softmax([-1000, -1000]), [0.5, 0.5], 12);
    expectVectorClose(softmax([-1002, -1001, -1000]), [0.0900306, 0.2447285, 0.665241]);
  });

  it('sends a hugely dominant logit to ~1 without producing NaN', () => {
    const p = softmax([0, 1000]);
    expect(p[0]).toBeCloseTo(0, 12);
    expect(p[1]).toBeCloseTo(1, 12);
    p.forEach((x) => expect(Number.isNaN(x)).toBe(false));
  });

  it('does not mutate its input', () => {
    const logits = [1, 2, 3];
    softmax(logits);
    expect(logits).toEqual([1, 2, 3]);
  });

  it('rejects an empty logit list', () => {
    expect(() => softmax([])).toThrow(RangeError);
  });

  it('rejects non-finite logits', () => {
    expect(() => softmax([1, Number.NaN])).toThrow(RangeError);
    expect(() => softmax([Number.POSITIVE_INFINITY, 0])).toThrow(RangeError);
    expect(() => softmax([Number.NEGATIVE_INFINITY, 0])).toThrow(RangeError);
  });
});

describe('weightedSum', () => {
  const V: Matrix = [
    [1, 0],
    [0, 1],
    [0.5, 0.5],
  ];

  it('mixes value vectors according to the weights', () => {
    expectVectorClose(weightedSum([0.2, 0.3, 0.5], V), [0.45, 0.55], 12);
    expectVectorClose(weightedSum([0.5, 0.5, 0], [[2, 4], [6, 8], [100, 100]]), [4, 6], 12);
  });

  it('selects a single row for a one-hot weight vector', () => {
    expect(weightedSum([0, 1, 0], V)).toEqual([0, 1]);
    expect(weightedSum([0, 0, 1], V)).toEqual([0.5, 0.5]);
  });

  it('returns a vector with the width of the value rows', () => {
    expect(weightedSum([1, 0], [[1, 2, 3, 4], [5, 6, 7, 8]])).toHaveLength(4);
  });

  it('rejects a weight count that does not match the number of value rows', () => {
    expect(() => weightedSum([0.5, 0.5], V)).toThrow(RangeError);
    expect(() => weightedSum([0.25, 0.25, 0.25, 0.25], V)).toThrow(RangeError);
  });

  it('rejects empty inputs', () => {
    expect(() => weightedSum([], [])).toThrow(RangeError);
  });

  it('rejects ragged value rows', () => {
    expect(() => weightedSum([0.5, 0.5], [[1, 2], [3]])).toThrow(RangeError);
  });

  it('rejects non-finite weights or values', () => {
    expect(() => weightedSum([Number.NaN, 1, 0], V)).toThrow(RangeError);
    expect(() => weightedSum([0.5, 0.5], [[1, Number.POSITIVE_INFINITY], [0, 0]])).toThrow(RangeError);
  });
});

describe('default Q/K/V data', () => {
  it('is a small, fixed 3-token example (dk = 4, dv = 2)', () => {
    expect(DEFAULT_Q).toEqual([
      [1, 0, 1, 0],
      [0, 1, 0, 1],
      [1, 1, 0, 0],
    ]);
    expect(DEFAULT_K).toEqual([
      [1, 0, 1, 0],
      [0, 1, 0, 1],
      [0, 0, 1, 1],
    ]);
    expect(DEFAULT_V).toEqual([
      [1, 0],
      [0, 1],
      [0.5, 0.5],
    ]);
  });
});

describe('attention', () => {
  it('computes raw scores Q·Kᵀ for the default data', () => {
    const result = attention(DEFAULT_Q, DEFAULT_K, DEFAULT_V);
    expect(result.scores).toEqual([
      [2, 0, 1],
      [0, 2, 1],
      [1, 1, 0],
    ]);
  });

  it('reports dk and the scaled scores (÷ sqrt(4) = ÷ 2)', () => {
    const result = attention(DEFAULT_Q, DEFAULT_K, DEFAULT_V);
    expect(result.dk).toBe(4);
    expect(result.scaledScores).toEqual([
      [1, 0, 0.5],
      [0, 1, 0.5],
      [0.5, 0.5, 0],
    ]);
  });

  it('turns each row of scaled scores into softmax attention weights', () => {
    const result = attention(DEFAULT_Q, DEFAULT_K, DEFAULT_V);
    expectMatrixClose(result.weights, [
      [0.5064804, 0.1863237, 0.3071959],
      [0.1863237, 0.5064804, 0.3071959],
      [0.38365, 0.38365, 0.2326999],
    ]);
    result.weights.forEach((row) => expect(sum(row)).toBeCloseTo(1, 12));
  });

  it('produces one output vector per query as the weighted sum of V', () => {
    const result = attention(DEFAULT_Q, DEFAULT_K, DEFAULT_V);
    expectMatrixClose(result.output, [
      [0.6600784, 0.3399216],
      [0.3399216, 0.6600784],
      [0.5, 0.5],
    ]);
  });

  it('agrees with composing the individual steps', () => {
    const result = attention(DEFAULT_Q, DEFAULT_K, DEFAULT_V);
    DEFAULT_Q.forEach((q, i) => {
      const raw = DEFAULT_K.map((k) => dot(q, k));
      const weights = softmax(scaleScores(raw, 4));
      expectVectorClose(result.output[i]!, weightedSum(weights, DEFAULT_V), 12);
    });
  });

  it('is deterministic and does not mutate its inputs', () => {
    const Q = DEFAULT_Q.map((row) => [...row]);
    const K = DEFAULT_K.map((row) => [...row]);
    const V = DEFAULT_V.map((row) => [...row]);
    const first = attention(Q, K, V);
    const second = attention(Q, K, V);
    expect(second).toEqual(first);
    expect(Q).toEqual(DEFAULT_Q);
    expect(K).toEqual(DEFAULT_K);
    expect(V).toEqual(DEFAULT_V);
  });

  it('supports a different number of queries than keys', () => {
    const result = attention([[1, 0]], [[1, 0], [0, 1]], [[10], [20]]);
    expect(result.scores).toEqual([[1, 0]]);
    expect(result.weights).toHaveLength(1);
    expect(result.weights[0]).toHaveLength(2);
    expect(result.output).toHaveLength(1);
    expect(result.output[0]).toHaveLength(1);
  });

  it('stays finite when queries and keys are very large', () => {
    const big = 1e4;
    const result = attention([[big, big]], [[big, big], [-big, -big]], [[1, 0], [0, 1]]);
    result.weights.flat().forEach((w) => expect(Number.isFinite(w)).toBe(true));
    result.output.flat().forEach((x) => expect(Number.isFinite(x)).toBe(true));
    expectVectorClose(result.output[0]!, [1, 0], 12);
  });

  describe('input validation', () => {
    it('rejects empty Q, K or V', () => {
      expect(() => attention([], DEFAULT_K, DEFAULT_V)).toThrow(RangeError);
      expect(() => attention(DEFAULT_Q, [], [])).toThrow(RangeError);
      expect(() => attention([[]], [[]], [[1]])).toThrow(RangeError);
    });

    it('rejects queries and keys with different widths', () => {
      expect(() => attention([[1, 0, 1]], DEFAULT_K, DEFAULT_V)).toThrow(RangeError);
    });

    it('rejects ragged Q, K or V matrices', () => {
      expect(() => attention([[1, 0, 1, 0], [1, 0]], DEFAULT_K, DEFAULT_V)).toThrow(RangeError);
      expect(() => attention(DEFAULT_Q, [[1, 0, 1, 0], [0, 1, 0, 1], [0, 0, 1]], DEFAULT_V)).toThrow(
        RangeError,
      );
      expect(() => attention(DEFAULT_Q, DEFAULT_K, [[1, 0], [0, 1], [0.5]])).toThrow(RangeError);
    });

    it('rejects a key count that does not match the value count', () => {
      expect(() => attention(DEFAULT_Q, DEFAULT_K, [[1, 0], [0, 1]])).toThrow(RangeError);
    });

    it('rejects non-finite entries', () => {
      expect(() => attention([[Number.NaN, 0, 1, 0]], DEFAULT_K, DEFAULT_V)).toThrow(RangeError);
      expect(() =>
        attention(DEFAULT_Q, DEFAULT_K, [[1, 0], [0, Number.POSITIVE_INFINITY], [0.5, 0.5]]),
      ).toThrow(RangeError);
    });
  });
});
