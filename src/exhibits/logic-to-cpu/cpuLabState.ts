import { step, type CpuState, type CpuTrace, type StepEvent } from './sim/cpu';

/** Running stops after this many instructions, so non-halting programs cannot spin forever. */
export const RUN_STEP_BUDGET = 256;
const LOG_LIMIT = 64;

export type CpuLabMode = 'idle' | 'running' | 'replaying';

export interface CpuLabState {
  initial: CpuState;
  current: CpuState;
  /** Most recent events last; bounded to LOG_LIMIT entries. */
  log: StepEvent[];
  mode: CpuLabMode;
  replay?: { trace: CpuTrace; index: number };
  notice?: string;
}

export type CpuLabAction =
  | { type: 'step' }
  | { type: 'run' }
  | { type: 'pause' }
  | { type: 'tick' }
  | { type: 'reset' }
  | { type: 'replay'; trace: CpuTrace }
  | { type: 'load'; cpu: CpuState };

export function createCpuLabState(cpu: CpuState): CpuLabState {
  return { initial: cpu, current: cpu, log: [], mode: 'idle' };
}

const appendLog = (log: StepEvent[], event: StepEvent) => [...log, event].slice(-LOG_LIMIT);

function advance(state: CpuLabState): CpuLabState {
  const { state: current, event } = step(state.current);
  return { ...state, current, log: current === state.current ? state.log : appendLog(state.log, event) };
}

export function cpuLabReducer(state: CpuLabState, action: CpuLabAction): CpuLabState {
  switch (action.type) {
    case 'step': {
      const next = advance({ ...state, mode: 'idle', replay: undefined, notice: undefined });
      return state.current.halted ? { ...next, notice: 'The CPU is halted. Reset to start again.' } : next;
    }
    case 'run':
      if (state.current.halted) return { ...state, notice: 'The CPU is halted. Reset to start again.' };
      return { ...state, mode: 'running', replay: undefined, notice: undefined };
    case 'pause':
      return { ...state, mode: 'idle' };
    case 'tick': {
      if (state.mode === 'running') {
        const next = advance(state);
        if (next.current.halted) return { ...next, mode: 'idle', notice: 'Halted.' };
        if (next.current.steps >= RUN_STEP_BUDGET) {
          return {
            ...next,
            mode: 'idle',
            notice: `Paused after the ${RUN_STEP_BUDGET}-step budget — this program may never reach HLT.`,
          };
        }
        return next;
      }
      if (state.mode === 'replaying' && state.replay) {
        const { trace, index } = state.replay;
        if (index >= trace.events.length) {
          return { ...state, mode: 'idle', replay: undefined, notice: trace.reason === 'budget' ? 'Replay ended at the step budget.' : 'Replay finished.' };
        }
        return {
          ...state,
          current: trace.states[index + 1]!,
          log: appendLog(state.log, trace.events[index]!),
          replay: { trace, index: index + 1 },
        };
      }
      return state;
    }
    case 'reset':
      return createCpuLabState(state.initial);
    case 'replay':
      return {
        ...state,
        current: action.trace.states[0]!,
        log: [],
        mode: 'replaying',
        replay: { trace: action.trace, index: 0 },
        notice: undefined,
      };
    case 'load':
      return createCpuLabState(action.cpu);
  }
}

export type CpuCommand = 'step' | 'toggle-run' | 'reset' | 'replay';

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Map a keydown inside the CPU lab to a command; null when the key should behave normally. */
export function keyToCpuCommand(event: KeyLike, targetTag: string): CpuCommand | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (TEXT_ENTRY_TAGS.has(targetTag.toUpperCase())) return null;
  switch (event.key) {
    case 's':
    case 'S':
      return 'step';
    case 'p':
    case 'P':
      return 'toggle-run';
    case 'r':
      return event.shiftKey ? 'replay' : 'reset';
    case 'R':
      return event.shiftKey ? 'replay' : 'reset';
    default:
      return null;
  }
}
