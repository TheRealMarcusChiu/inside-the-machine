import { codecs, readState, writeState, type ParamCodec, type StateSchema } from '../../lib/url/urlState';
import { cleanFailures, LAYOUTS, LIMITS, normalizeConfig, type Layout } from './model/topology';

export type Depth = 'short' | 'deep';

/** Everything a visitor can share about this exhibit via its URL. */
export interface ZfsUrlState {
  depth: Depth;
  layout: Layout;
  width: number;
  vdevs: number;
  diskSizeTB: number;
  /** Failed disk indices, in the order they failed (the tracer replays this order). */
  failed: number[];
}

const MAX_DISKS = 12 * LIMITS.vdevs.max;

/** Dot-separated disk indices, e.g. "5.0.7". */
const diskList: ParamCodec<number[]> = {
  parse(raw) {
    if (raw === null || !/^\d{1,3}(\.\d{1,3})*$/.test(raw)) return undefined;
    const list = raw.split('.').map(Number);
    return list.length <= MAX_DISKS ? list : undefined;
  },
  serialize: (v) => v.join('.'),
};

const schema: StateSchema<ZfsUrlState> = {
  depth: { key: 'depth', codec: codecs.oneOf(['short', 'deep'] as const), default: 'short' },
  // Defaults reproduce the worked example: 2 × 6-wide RAIDZ2 of 10 TB disks.
  layout: { key: 'lay', codec: codecs.oneOf(LAYOUTS), default: 'raidz2' },
  width: { key: 'w', codec: codecs.int(1, 99), default: 6 },
  vdevs: { key: 'v', codec: codecs.int(LIMITS.vdevs.min, LIMITS.vdevs.max), default: 2 },
  diskSizeTB: { key: 'tb', codec: codecs.int(LIMITS.diskSizeTB.min, LIMITS.diskSizeTB.max), default: 10 },
  failed: { key: 'fail', codec: diskList, default: [] },
};

function normalise(s: ZfsUrlState): ZfsUrlState {
  const config = normalizeConfig(s);
  return { depth: s.depth, ...config, failed: cleanFailures(config, s.failed) };
}

export const DEFAULT_ZFS_STATE: ZfsUrlState = normalise(readState(schema, new URLSearchParams()));

export function readZfsState(params: URLSearchParams): ZfsUrlState {
  return normalise(readState(schema, params));
}

export function writeZfsState(state: ZfsUrlState, base?: URLSearchParams): URLSearchParams {
  return writeState(schema, normalise(state), base);
}

/**
 * Apply a change from the controls. Disk indices only mean something for one geometry, so changing the layout,
 * width or vdev count clears the failures; changing disk size does not move any disk.
 */
export function applyPatch(state: ZfsUrlState, patch: Partial<ZfsUrlState>): ZfsUrlState {
  const next = normalise({ ...state, ...patch, failed: patch.failed ?? state.failed });
  const moved = next.layout !== state.layout || next.width !== state.width || next.vdevs !== state.vdevs;
  return moved && patch.failed === undefined ? { ...next, failed: [] } : next;
}
