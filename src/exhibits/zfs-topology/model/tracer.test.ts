import { describe, expect, it } from 'vitest';
import { initialTracer, traceFailures, tracerKeyAction, tracerReducer, type TracerState } from './tracer';
import type { PoolConfig } from './topology';

const pool: PoolConfig = { layout: 'raidz2', width: 6, vdevs: 2, diskSizeTB: 10 };

describe('traceFailures', () => {
  it('records the pool after each failure in order, starting from all-online', () => {
    const steps = traceFailures(pool, [0, 6, 1, 2]);
    expect(steps).toHaveLength(5);
    expect(steps[0]!.event).toBeNull();
    expect(steps.map((s) => s.health.state)).toEqual(['ONLINE', 'DEGRADED', 'DEGRADED', 'DEGRADED', 'FAULTED']);
    expect(steps[2]!.event).toEqual({ disk: 6, vdev: 1, position: 0 });
    expect(steps[4]!.lostDataHere).toBe(true);
    expect(steps[3]!.lostDataHere).toBe(false);
  });

  it('marks only the first fatal step as the moment of loss', () => {
    const steps = traceFailures(pool, [0, 1, 2, 3]);
    expect(steps.map((s) => s.lostDataHere)).toEqual([false, false, false, true, false]);
  });

  it('ignores duplicate and out-of-range disks', () => {
    expect(traceFailures(pool, [0, 0, 500])).toHaveLength(2);
  });
});

describe('tracerReducer', () => {
  const at = (step: number, length = 4, playing = false): TracerState => ({ step, length, playing });

  it('starts at the end of the sequence (the current failures), paused', () => {
    expect(initialTracer(3)).toEqual(at(3, 3));
  });

  it('steps forward and back within bounds and pauses', () => {
    expect(tracerReducer(at(1, 4, true), { type: 'step' })).toEqual(at(2));
    expect(tracerReducer(at(4), { type: 'step' })).toEqual(at(4));
    expect(tracerReducer(at(0), { type: 'back' })).toEqual(at(0));
    expect(tracerReducer(at(2), { type: 'back' })).toEqual(at(1));
  });

  it('reset rewinds to all-online and pauses', () => {
    expect(tracerReducer(at(3, 4, true), { type: 'reset' })).toEqual(at(0));
  });

  it('play from the end restarts; play with nothing to trace does nothing', () => {
    expect(tracerReducer(at(4), { type: 'play' })).toEqual(at(0, 4, true));
    expect(tracerReducer(at(1), { type: 'play' })).toEqual(at(1, 4, true));
    expect(tracerReducer(at(0, 0), { type: 'play' })).toEqual(at(0, 0));
    expect(tracerReducer(at(1, 4, true), { type: 'toggle' })).toEqual(at(1));
    expect(tracerReducer(at(1), { type: 'toggle' })).toEqual(at(1, 4, true));
    expect(tracerReducer(at(1, 4, true), { type: 'pause' })).toEqual(at(1));
  });

  it('ticks advance only while playing and stop at the end', () => {
    expect(tracerReducer(at(1), { type: 'tick' })).toEqual(at(1));
    expect(tracerReducer(at(2, 4, true), { type: 'tick' })).toEqual(at(3, 4, true));
    expect(tracerReducer(at(3, 4, true), { type: 'tick' })).toEqual(at(4, 4, false));
  });

  it('replay rewinds and plays, or only rewinds when autoplay is not allowed', () => {
    expect(tracerReducer(at(4), { type: 'replay', autoplay: true })).toEqual(at(0, 4, true));
    expect(tracerReducer(at(4), { type: 'replay', autoplay: false })).toEqual(at(0));
  });

  it('sync jumps to the end of a new sequence', () => {
    expect(tracerReducer(at(1, 4, true), { type: 'sync', length: 6 })).toEqual(at(6, 6));
  });
});

describe('tracerKeyAction', () => {
  it('maps keys to tracer actions', () => {
    expect(tracerKeyAction('s')).toEqual({ type: 'step' });
    expect(tracerKeyAction('ArrowRight')).toEqual({ type: 'step' });
    expect(tracerKeyAction('ArrowLeft')).toEqual({ type: 'back' });
    expect(tracerKeyAction('p')).toEqual({ type: 'toggle' });
    expect(tracerKeyAction('r')).toEqual({ type: 'reset' });
    expect(tracerKeyAction('x')).toBeUndefined();
  });
});
