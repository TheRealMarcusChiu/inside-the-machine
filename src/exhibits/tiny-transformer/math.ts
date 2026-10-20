/**
 * Scaled dot-product attention, exactly as defined by Vaswani et al. (2017):
 *
 *   Attention(Q, K, V) = softmax(Q·Kᵀ / √dk) · V
 *
 * Pure functions over plain number arrays. Nothing here mutates its inputs, and every
 * function rejects empty, ragged or non-finite data with a RangeError rather than
 * quietly returning NaN.
 */

export type Vector = readonly number[];
export type Matrix = readonly Vector[];

/** Every intermediate of one attention pass, so each step can be inspected. */
export interface AttentionResult {
  /** Width of each query and key vector. */
  dk: number;
  /** Width of each value vector (and of each output row). */
  dv: number;
  /** √dk, the divisor applied to the raw scores. */
  scale: number;
  /** Raw scores Q·Kᵀ: one row per query, one column per key. */
  scores: number[][];
  /** Raw scores divided by √dk. */
  scaledScores: number[][];
  /** Softmax of each scaled row: one probability distribution over the keys per query. */
  weights: number[][];
  /** weights · V: one dv-wide output vector per query. */
  output: number[][];
}

function assertFiniteVector(v: Vector, what: string): void {
  if (v.length === 0) throw new RangeError(`${what} must not be empty`);
  for (let i = 0; i < v.length; i++) {
    if (!Number.isFinite(v[i])) throw new RangeError(`${what}[${i}] is not a finite number`);
  }
}

/** Check that a matrix is non-empty, rectangular and finite; returns its width. */
function assertFiniteMatrix(m: Matrix, what: string): number {
  if (m.length === 0) throw new RangeError(`${what} must have at least one row`);
  const width = m[0]!.length;
  m.forEach((row, i) => {
    assertFiniteVector(row, `${what} row ${i}`);
    if (row.length !== width) {
      throw new RangeError(`${what} is ragged: row ${i} has ${row.length} entries, expected ${width}`);
    }
  });
  return width;
}

/** a·b = Σ aᵢbᵢ */
export function dot(a: Vector, b: Vector): number {
  assertFiniteVector(a, 'a');
  assertFiniteVector(b, 'b');
  if (a.length !== b.length) throw new RangeError(`cannot dot vectors of length ${a.length} and ${b.length}`);
  let total = 0;
  for (let i = 0; i < a.length; i++) total += a[i]! * b[i]!;
  return total;
}

/** Divide every raw score by √dk. dk must be a positive integer (it is a vector width). */
export function scaleScores(scores: Vector, dk: number): number[] {
  if (!Number.isInteger(dk) || dk < 1) throw new RangeError(`dk must be a positive integer, got ${dk}`);
  assertFiniteVector(scores, 'scores');
  const root = Math.sqrt(dk);
  return scores.map((s) => s / root);
}

/**
 * softmax(x)ᵢ = e^(xᵢ − max x) / Σⱼ e^(xⱼ − max x)
 *
 * Subtracting the maximum first leaves the result mathematically unchanged but keeps every
 * exponent ≤ 0, so e^… never overflows to Infinity and at least one term is exactly 1.
 */
export function softmax(logits: Vector): number[] {
  assertFiniteVector(logits, 'logits');
  let max = -Infinity;
  for (const x of logits) if (x > max) max = x;
  const exps = logits.map((x) => Math.exp(x - max));
  const total = exps.reduce((acc, e) => acc + e, 0);
  return exps.map((e) => e / total);
}

/** Σⱼ wⱼ·Vⱼ — a blend of the value rows, one weight per row. */
export function weightedSum(weights: Vector, values: Matrix): number[] {
  assertFiniteVector(weights, 'weights');
  const width = assertFiniteMatrix(values, 'values');
  if (weights.length !== values.length) {
    throw new RangeError(`${weights.length} weights cannot mix ${values.length} value rows`);
  }
  const out = new Array<number>(width).fill(0);
  values.forEach((row, j) => {
    const w = weights[j]!;
    for (let c = 0; c < width; c++) out[c]! += w * row[c]!;
  });
  return out;
}

/** Scaled dot-product attention for every query, returning all intermediates. */
export function attention(Q: Matrix, K: Matrix, V: Matrix): AttentionResult {
  const dk = assertFiniteMatrix(Q, 'Q');
  const keyWidth = assertFiniteMatrix(K, 'K');
  const dv = assertFiniteMatrix(V, 'V');
  if (keyWidth !== dk) throw new RangeError(`queries have width ${dk} but keys have width ${keyWidth}`);
  if (K.length !== V.length) throw new RangeError(`${K.length} keys need ${K.length} values, got ${V.length}`);

  const scores = Q.map((q) => K.map((k) => dot(q, k)));
  const scaledScores = scores.map((row) => scaleScores(row, dk));
  const weights = scaledScores.map((row) => softmax(row));
  const output = weights.map((row) => weightedSum(row, V));
  return { dk, dv, scale: Math.sqrt(dk), scores, scaledScores, weights, output };
}

function freezeMatrix(rows: number[][]): Matrix {
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

/**
 * The exhibit's worked example: three tokens, dk = 4, dv = 2.
 * Query 1 matches key 1 exactly, query 2 matches key 2, and query 3 half-matches both.
 */
export const DEFAULT_Q: Matrix = freezeMatrix([
  [1, 0, 1, 0],
  [0, 1, 0, 1],
  [1, 1, 0, 0],
]);

export const DEFAULT_K: Matrix = freezeMatrix([
  [1, 0, 1, 0],
  [0, 1, 0, 1],
  [0, 0, 1, 1],
]);

export const DEFAULT_V: Matrix = freezeMatrix([
  [1, 0],
  [0, 1],
  [0.5, 0.5],
]);
