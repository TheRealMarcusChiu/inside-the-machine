/**
 * Typed, defensive URL state. Every exhibit describes its shareable state with a
 * schema of codecs; invalid or tampered values silently fall back to defaults,
 * and defaults are omitted so shared links stay short.
 */
export interface ParamCodec<T> {
  /** Return undefined when the raw value is missing or invalid. */
  parse(raw: string | null): T | undefined;
  serialize(value: T): string;
}

export type StateSchema<T> = {
  [K in keyof T]: { key: string; codec: ParamCodec<T[K]>; default: T[K] };
};

function int(min: number, max: number): ParamCodec<number> {
  return {
    parse(raw) {
      if (raw === null || !/^-?\d+$/.test(raw)) return undefined;
      const n = Number(raw);
      return Number.isSafeInteger(n) && n >= min && n <= max ? n : undefined;
    },
    serialize: (n) => String(n),
  };
}

function oneOf<const V extends string>(values: readonly V[]): ParamCodec<V> {
  return {
    parse: (raw) => (raw !== null && (values as readonly string[]).includes(raw) ? (raw as V) : undefined),
    serialize: (v) => v,
  };
}

function bit(): ParamCodec<0 | 1> {
  return {
    parse: (raw) => (raw === '0' ? 0 : raw === '1' ? 1 : undefined),
    serialize: (v) => String(v),
  };
}

function bool(): ParamCodec<boolean> {
  return {
    parse: (raw) => (raw === '1' ? true : raw === '0' ? false : undefined),
    serialize: (v) => (v ? '1' : '0'),
  };
}

export function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeBase64Url(encoded: string): string | undefined {
  if (!/^[A-Za-z0-9_-]*$/.test(encoded)) return undefined;
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** Free text (e.g. assembly source), stored as URL-safe base64 of UTF-8, capped in length. */
function text(maxLength: number): ParamCodec<string> {
  return {
    parse(raw) {
      if (raw === null) return undefined;
      const decoded = decodeBase64Url(raw);
      return decoded !== undefined && decoded.length <= maxLength ? decoded : undefined;
    },
    serialize: (v) => encodeBase64Url(v),
  };
}

export const codecs = { int, oneOf, bit, bool, text };

export function readState<T>(schema: StateSchema<T>, params: URLSearchParams): T {
  const out = {} as T;
  for (const field of Object.keys(schema) as (keyof T)[]) {
    const { key, codec, default: fallback } = schema[field];
    const parsed = codec.parse(params.get(key));
    out[field] = parsed === undefined ? fallback : parsed;
  }
  return out;
}

export function writeState<T>(schema: StateSchema<T>, state: T, base?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(base);
  for (const field of Object.keys(schema) as (keyof T)[]) {
    const { key, codec, default: fallback } = schema[field];
    const value = state[field];
    if (codec.serialize(value) === codec.serialize(fallback)) params.delete(key);
    else params.set(key, codec.serialize(value));
  }
  return params;
}
