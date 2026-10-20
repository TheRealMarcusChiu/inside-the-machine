import { codecs, readState, writeState, type StateSchema } from '../../lib/url/urlState';
import { ALL_CONDITION_VALUES, DB_RANGE, DEFAULT_CONDITIONS, RTT_RANGE, type Conditions } from './model/journey';

export type Depth = 'short' | 'deep';

/** The most trace steps any journey has; the trace position is clamped to the real length. */
export const MAX_TRACE_STEPS = 20;

/** Everything a visitor can share about this exhibit via its URL. */
export interface WebRequestUrlState extends Conditions {
  depth: Depth;
  /** Trace position: how many steps have been revealed. */
  step: number;
}

const v = ALL_CONDITION_VALUES;
const d = DEFAULT_CONDITIONS;

const schema: StateSchema<WebRequestUrlState> = {
  depth: { key: 'depth', codec: codecs.oneOf(['short', 'deep'] as const), default: 'short' },
  step: { key: 'step', codec: codecs.int(0, MAX_TRACE_STEPS), default: 0 },
  dns: { key: 'dns', codec: codecs.oneOf(v.dns), default: d.dns },
  connection: { key: 'conn', codec: codecs.oneOf(v.connection), default: d.connection },
  tls: { key: 'tls', codec: codecs.oneOf(v.tls), default: d.tls },
  protocol: { key: 'proto', codec: codecs.oneOf(v.protocol), default: d.protocol },
  httpCache: { key: 'hc', codec: codecs.oneOf(v.httpCache), default: d.httpCache },
  appCache: { key: 'ac', codec: codecs.oneOf(v.appCache), default: d.appCache },
  rttMs: { key: 'rtt', codec: codecs.int(RTT_RANGE.min, RTT_RANGE.max), default: d.rttMs },
  dbMs: { key: 'db', codec: codecs.int(DB_RANGE.min, DB_RANGE.max), default: d.dbMs },
};

export const DEFAULT_WEB_REQUEST_STATE: WebRequestUrlState = readState(schema, new URLSearchParams());

export function readWebRequestState(params: URLSearchParams): WebRequestUrlState {
  return readState(schema, params);
}

export function writeWebRequestState(state: WebRequestUrlState, base?: URLSearchParams): URLSearchParams {
  return writeState(schema, state, base);
}

export function toConditions({ dns, connection, tls, protocol, httpCache, appCache, rttMs, dbMs }: WebRequestUrlState): Conditions {
  return { dns, connection, tls, protocol, httpCache, appCache, rttMs, dbMs };
}
