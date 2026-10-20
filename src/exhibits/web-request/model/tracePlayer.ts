/**
 * The trace player: which of the journey's active steps have been revealed.
 * cursor = 0 means "ready, nothing shown yet"; cursor = n means steps 1..n are done
 * and step n is the current one.
 */
export interface PlayerState {
  cursor: number;
  length: number;
  playing: boolean;
}

export type PlayerAction =
  | { type: 'step' }
  | { type: 'back' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'tick' }
  | { type: 'reset' }
  | { type: 'replay' }
  | { type: 'end' }
  | { type: 'load'; length: number };

const clamp = (n: number, length: number) => Math.min(Math.max(n, 0), length);

export function createPlayer(length: number, cursor = 0): PlayerState {
  return { cursor: clamp(cursor, length), length, playing: false };
}

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'step':
      return { ...state, cursor: clamp(state.cursor + 1, state.length), playing: false };
    case 'back':
      return { ...state, cursor: clamp(state.cursor - 1, state.length), playing: false };
    case 'play':
      return state.cursor >= state.length ? { ...state, cursor: 0, playing: true } : { ...state, playing: true };
    case 'pause':
      return { ...state, playing: false };
    case 'toggle':
      return playerReducer(state, { type: state.playing ? 'pause' : 'play' });
    case 'tick': {
      if (!state.playing) return state;
      const cursor = clamp(state.cursor + 1, state.length);
      return { ...state, cursor, playing: cursor < state.length };
    }
    case 'reset':
      return { ...state, cursor: 0, playing: false };
    case 'replay':
      return { ...state, cursor: 0, playing: true };
    case 'end':
      return { ...state, cursor: state.length, playing: false };
    case 'load':
      return createPlayer(action.length);
  }
}

export type TraceCommand = 'step' | 'back' | 'toggle' | 'reset' | 'replay' | 'end';

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Map a keydown inside the trace controls to a command; null when the key should behave normally. */
export function keyToTraceCommand(event: KeyLike, targetTag: string): TraceCommand | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (TEXT_ENTRY_TAGS.has(targetTag.toUpperCase())) return null;
  switch (event.key) {
    case 'ArrowRight':
    case 'n':
    case 'N':
      return 'step';
    case 'ArrowLeft':
    case 'b':
    case 'B':
      return 'back';
    case 'p':
    case 'P':
      return 'toggle';
    case 'r':
    case 'R':
      return event.shiftKey ? 'replay' : 'reset';
    case 'Home':
      return 'reset';
    case 'End':
      return 'end';
    default:
      return null;
  }
}
