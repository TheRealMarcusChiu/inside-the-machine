import { codecs, readState, writeState, type ParamCodec, type StateSchema } from '../../lib/url/urlState';
import { DEFAULT_WORKLOAD, MAX_LANES, MAX_PATHS, type Regularity, type Workload } from './model';

export type Depth = 'short' | 'deep';
export const WARP_WIDTHS = [4, 8, 16, 32] as const;

/** Everything a visitor can share about this exhibit via its URL. */
export interface ExhibitUrlState extends Workload {
  depth: Depth;
}

function warpWidth(): ParamCodec<number> {
  const int = codecs.int(1, 32);
  return {
    parse: (raw) => {
      const n = int.parse(raw);
      return n !== undefined && (WARP_WIDTHS as readonly number[]).includes(n) ? n : undefined;
    },
    serialize: int.serialize,
  };
}

// Defaults reproduce the worked example.
const schema: StateSchema<ExhibitUrlState> = {
  depth: { key: 'depth', codec: codecs.oneOf(['short', 'deep'] as const), default: 'short' },
  lanes: { key: 'lanes', codec: codecs.int(1, MAX_LANES), default: DEFAULT_WORKLOAD.lanes },
  warpWidth: { key: 'warp', codec: warpWidth(), default: DEFAULT_WORKLOAD.warpWidth },
  divergence: { key: 'div', codec: codecs.int(1, MAX_PATHS), default: DEFAULT_WORKLOAD.divergence },
  regularity: {
    key: 'access',
    codec: codecs.oneOf<Regularity>(['regular', 'irregular']),
    default: DEFAULT_WORKLOAD.regularity,
  },
  transfer: { key: 'xfer', codec: codecs.bool(), default: DEFAULT_WORKLOAD.transfer },
};

export const DEFAULT_EXHIBIT_STATE: ExhibitUrlState = readState(schema, new URLSearchParams());

export function readExhibitState(params: URLSearchParams): ExhibitUrlState {
  return readState(schema, params);
}

export function writeExhibitState(state: ExhibitUrlState, base?: URLSearchParams): URLSearchParams {
  return writeState(schema, state, base);
}
