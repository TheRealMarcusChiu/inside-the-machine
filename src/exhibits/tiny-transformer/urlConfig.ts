import { codecs, readState, writeState, type ParamCodec, type StateSchema } from '../../lib/url/urlState';
import { DEFAULT_K, DEFAULT_Q, DEFAULT_V, type Matrix } from './math';

export type Depth = 'short' | 'deep';

/** The toy is fixed at three tokens with dk = 4 and dv = 2, so every shared link has the same shape. */
export const TOKENS = DEFAULT_Q.length;
export const DK = DEFAULT_Q[0]!.length;
export const DV = DEFAULT_V[0]!.length;

/** Editable entries stay in a small, readable range. */
export const ENTRY_MIN = -10;
export const ENTRY_MAX = 10;
const ENTRY_DECIMALS = 4;

/** Stages of the simulation walkthrough, in order. */
export const STAGES = [
  { id: 'inputs', label: 'Inputs Q, K and V' },
  { id: 'raw', label: 'Raw scores Q·Kᵀ' },
  { id: 'scale', label: 'Scale by √dk' },
  { id: 'softmax', label: 'Softmax into weights' },
  { id: 'mix', label: 'Weighted sum of V' },
] as const;
export const LAST_STAGE = STAGES.length - 1;

/** Frames of the visual guide. */
export const GUIDE_FRAMES = 4;

/** Everything a visitor can share about this exhibit via its URL. */
export interface TinyTransformerState {
  depth: Depth;
  q: Matrix;
  k: Matrix;
  v: Matrix;
  /** Current walkthrough stage (index into STAGES). */
  stage: number;
  /** Which query row the step-by-step arithmetic explains. */
  row: number;
  /** Current frame of the visual guide. */
  guide: number;
}

/** Round to a fixed number of decimals so URLs and displays stay tidy; -0 becomes 0. */
export function roundEntry(n: number): number {
  const r = Math.round(n * 10 ** ENTRY_DECIMALS) / 10 ** ENTRY_DECIMALS;
  return r === 0 ? 0 : r;
}

const ENTRY_PATTERN = /^\s*[-−]?(?:\d+(?:\.\d*)?|\.\d+)\s*$/;

/**
 * Parse one typed or shared matrix entry. Returns undefined for anything that is not a plain
 * decimal number inside [ENTRY_MIN, ENTRY_MAX] — no exponents, Infinity, NaN or hex.
 */
export function parseEntry(raw: string): number | undefined {
  if (!ENTRY_PATTERN.test(raw)) return undefined;
  const n = Number(raw.trim().replace('−', '-'));
  if (!Number.isFinite(n) || n < ENTRY_MIN || n > ENTRY_MAX) return undefined;
  return roundEntry(n);
}

/** Matrices travel as "1_0_1_0*0_1_0_1*…": "_" between entries, "*" between rows (both URL-safe). */
export function matrixCodec(rows: number, cols: number): ParamCodec<Matrix> {
  return {
    parse(raw) {
      if (raw === null || raw.length > rows * cols * 12) return undefined;
      const parts = raw.split('*');
      if (parts.length !== rows) return undefined;
      const out: number[][] = [];
      for (const part of parts) {
        const cells = part.split('_');
        if (cells.length !== cols) return undefined;
        const row: number[] = [];
        for (const cell of cells) {
          // Shared links use ASCII only; the Unicode minus is accepted only when typed.
          if (cell.includes('−')) return undefined;
          const n = parseEntry(cell);
          if (n === undefined) return undefined;
          row.push(n);
        }
        out.push(row);
      }
      return out;
    },
    serialize: (m) => m.map((row) => row.map((n) => String(roundEntry(n))).join('_')).join('*'),
  };
}

const schema: StateSchema<TinyTransformerState> = {
  depth: { key: 'depth', codec: codecs.oneOf(['short', 'deep'] as const), default: 'short' },
  // Defaults reproduce the worked example.
  q: { key: 'q', codec: matrixCodec(TOKENS, DK), default: DEFAULT_Q },
  k: { key: 'k', codec: matrixCodec(TOKENS, DK), default: DEFAULT_K },
  v: { key: 'v', codec: matrixCodec(TOKENS, DV), default: DEFAULT_V },
  stage: { key: 'stage', codec: codecs.int(0, LAST_STAGE), default: 0 },
  row: { key: 'row', codec: codecs.int(0, TOKENS - 1), default: 0 },
  guide: { key: 'guide', codec: codecs.int(0, GUIDE_FRAMES - 1), default: 0 },
};

export const DEFAULT_STATE: TinyTransformerState = readState(schema, new URLSearchParams());

export function readTinyState(params: URLSearchParams): TinyTransformerState {
  return readState(schema, params);
}

export function writeTinyState(state: TinyTransformerState, base?: URLSearchParams): URLSearchParams {
  return writeState(schema, state, base);
}

/** A copy of `m` with one entry replaced. */
export function withEntry(m: Matrix, row: number, col: number, value: number): Matrix {
  return m.map((r, i) => (i === row ? r.map((x, j) => (j === col ? value : x)) : r));
}
