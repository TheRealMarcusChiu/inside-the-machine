import { codecs, readState, writeState, type StateSchema } from '../../lib/url/urlState';
import { GATE_TYPES, type Bit, type GateType } from './sim/gates';
import { PRESET_PROGRAMS } from './sim/programs';

export type Depth = 'short' | 'deep';
export const PROGRAM_CHOICES = [...PRESET_PROGRAMS.map((p) => p.id), 'custom'] as const;
export type ProgramChoice = (typeof PROGRAM_CHOICES)[number];

/** Everything a visitor can share about this exhibit via its URL. */
export interface ExhibitUrlState {
  depth: Depth;
  gate: GateType;
  ga: Bit;
  gb: Bit;
  a: number;
  b: number;
  cin: Bit;
  program: ProgramChoice;
  /** Only used when program === "custom". */
  source: string;
}

export const MAX_SOURCE_LENGTH = 2000;

const schema: StateSchema<ExhibitUrlState> = {
  depth: { key: 'depth', codec: codecs.oneOf(['short', 'deep'] as const), default: 'short' },
  gate: { key: 'gate', codec: codecs.oneOf(GATE_TYPES), default: 'AND' },
  ga: { key: 'ga', codec: codecs.bit(), default: 0 },
  gb: { key: 'gb', codec: codecs.bit(), default: 0 },
  // Defaults reproduce the worked example: 6 + 7.
  a: { key: 'a', codec: codecs.int(0, 15), default: 6 },
  b: { key: 'b', codec: codecs.int(0, 15), default: 7 },
  cin: { key: 'cin', codec: codecs.bit(), default: 0 },
  program: { key: 'prog', codec: codecs.oneOf(PROGRAM_CHOICES), default: 'add' },
  source: { key: 'src', codec: codecs.text(MAX_SOURCE_LENGTH), default: '' },
};

export const DEFAULT_EXHIBIT_STATE: ExhibitUrlState = readState(schema, new URLSearchParams());

export function readExhibitState(params: URLSearchParams): ExhibitUrlState {
  return readState(schema, params);
}

export function writeExhibitState(state: ExhibitUrlState, base?: URLSearchParams): URLSearchParams {
  const normalised = state.program === 'custom' ? state : { ...state, source: '' };
  return writeState(schema, normalised, base);
}
