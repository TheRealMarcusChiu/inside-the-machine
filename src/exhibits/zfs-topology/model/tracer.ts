import { cleanFailures, diskLocation, evaluatePool, type PoolConfig, type PoolHealth } from './topology';

/** One moment in a failure sequence: the pool after the first `index` failures. */
export interface TraceStep {
  index: number;
  /** The disk that failed at this step; null for the starting, all-online pool. */
  event: { disk: number; vdev: number; position: number } | null;
  failedSoFar: number[];
  health: PoolHealth;
  /** True only at the step where the pool first loses data. */
  lostDataHere: boolean;
}

export function traceFailures(c: PoolConfig, order: readonly number[]): TraceStep[] {
  const clean = cleanFailures(c, order);
  const steps: TraceStep[] = [];
  for (let i = 0; i <= clean.length; i++) {
    const failedSoFar = clean.slice(0, i);
    const health = evaluatePool(c, failedSoFar);
    const disk = clean[i - 1];
    steps.push({
      index: i,
      event: disk === undefined ? null : { disk, ...diskLocation(c, disk) },
      failedSoFar,
      health,
      lostDataHere: health.dataLoss && !(steps[i - 1]?.health.dataLoss ?? false),
    });
  }
  return steps;
}

/** Playback over a sequence of `length` failures; `step` ranges from 0 (all online) to `length`. */
export interface TracerState {
  step: number;
  length: number;
  playing: boolean;
}

export type TracerAction =
  | { type: 'step' }
  | { type: 'back' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'reset' }
  | { type: 'replay'; autoplay: boolean }
  | { type: 'tick' }
  | { type: 'sync'; length: number };

/** The tracer opens on the visitor's current failures: the end of the sequence. */
export const initialTracer = (length: number): TracerState => ({ step: length, length, playing: false });

export function tracerReducer(s: TracerState, a: TracerAction): TracerState {
  switch (a.type) {
    case 'step':
      return { ...s, step: Math.min(s.step + 1, s.length), playing: false };
    case 'back':
      return { ...s, step: Math.max(s.step - 1, 0), playing: false };
    case 'pause':
      return { ...s, playing: false };
    case 'play':
      if (s.length === 0) return s;
      return { ...s, step: s.step >= s.length ? 0 : s.step, playing: true };
    case 'toggle':
      return tracerReducer(s, { type: s.playing ? 'pause' : 'play' });
    case 'reset':
      return { ...s, step: 0, playing: false };
    case 'replay':
      return { ...s, step: 0, playing: a.autoplay && s.length > 0 };
    case 'tick': {
      if (!s.playing) return s;
      const step = Math.min(s.step + 1, s.length);
      return { ...s, step, playing: step < s.length };
    }
    case 'sync':
      return initialTracer(a.length);
  }
}

/** Shortcuts, active only while focus is inside the tracer figure. */
export function tracerKeyAction(key: string): TracerAction | undefined {
  switch (key) {
    case 's':
    case 'S':
    case 'ArrowRight':
      return { type: 'step' };
    case 'ArrowLeft':
      return { type: 'back' };
    case 'p':
    case 'P':
      return { type: 'toggle' };
    case 'r':
    case 'R':
      return { type: 'reset' };
    default:
      return undefined;
  }
}
