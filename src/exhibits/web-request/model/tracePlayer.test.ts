import { describe, expect, it } from 'vitest';
import { createPlayer, keyToTraceCommand, playerReducer, type PlayerState } from './tracePlayer';

const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

const run = (state: PlayerState, ...types: Parameters<typeof playerReducer>[1]['type'][]) =>
  types.reduce((s, type) => playerReducer(s, { type } as Parameters<typeof playerReducer>[1]), state);

describe('createPlayer', () => {
  it('starts paused before the first step', () => {
    expect(createPlayer(5)).toEqual({ cursor: 0, length: 5, playing: false });
  });

  it('clamps a restored cursor into range', () => {
    expect(createPlayer(5, 9).cursor).toBe(5);
    expect(createPlayer(5, -2).cursor).toBe(0);
  });
});

describe('playerReducer', () => {
  it('steps forward and back, clamped at both ends', () => {
    let s = createPlayer(2);
    s = run(s, 'step');
    expect(s.cursor).toBe(1);
    s = run(s, 'step', 'step', 'step');
    expect(s.cursor).toBe(2);
    s = run(s, 'back', 'back', 'back');
    expect(s.cursor).toBe(0);
  });

  it('play advances on each tick and stops by itself at the end', () => {
    let s = run(createPlayer(2), 'play');
    expect(s.playing).toBe(true);
    s = run(s, 'tick');
    expect(s).toMatchObject({ cursor: 1, playing: true });
    s = run(s, 'tick');
    expect(s).toMatchObject({ cursor: 2, playing: false });
    expect(run(s, 'tick')).toEqual(s);
  });

  it('play at the end starts again from the beginning', () => {
    const s = run(createPlayer(3, 3), 'play');
    expect(s).toMatchObject({ cursor: 0, playing: true });
  });

  it('pause stops playback; manual stepping also pauses', () => {
    expect(run(createPlayer(3), 'play', 'pause').playing).toBe(false);
    expect(run(createPlayer(3), 'play', 'step')).toMatchObject({ cursor: 1, playing: false });
    expect(run(createPlayer(3), 'toggle').playing).toBe(true);
    expect(run(createPlayer(3), 'toggle', 'toggle').playing).toBe(false);
  });

  it('ticks while paused do nothing', () => {
    const s = createPlayer(3, 1);
    expect(run(s, 'tick')).toBe(s);
  });

  it('reset rewinds and pauses; replay rewinds and plays; end shows everything', () => {
    expect(run(createPlayer(4, 3), 'play', 'reset')).toEqual({ cursor: 0, length: 4, playing: false });
    expect(run(createPlayer(4, 3), 'replay')).toEqual({ cursor: 0, length: 4, playing: true });
    expect(run(createPlayer(4, 1), 'end')).toEqual({ cursor: 4, length: 4, playing: false });
  });

  it('resizing for a new journey rewinds to the start', () => {
    const s = playerReducer(createPlayer(11, 7), { type: 'load', length: 2 });
    expect(s).toEqual({ cursor: 0, length: 2, playing: false });
  });
});

describe('keyToTraceCommand', () => {
  it('maps arrow keys and letters to trace commands', () => {
    expect(keyToTraceCommand(key('ArrowRight'), 'BUTTON')).toBe('step');
    expect(keyToTraceCommand(key('n'), 'DIV')).toBe('step');
    expect(keyToTraceCommand(key('ArrowLeft'), 'BUTTON')).toBe('back');
    expect(keyToTraceCommand(key('b'), 'DIV')).toBe('back');
    expect(keyToTraceCommand(key('p'), 'DIV')).toBe('toggle');
    expect(keyToTraceCommand(key('r'), 'DIV')).toBe('reset');
    expect(keyToTraceCommand(key('R', { shiftKey: true }), 'DIV')).toBe('replay');
    expect(keyToTraceCommand(key('Home'), 'DIV')).toBe('reset');
    expect(keyToTraceCommand(key('End'), 'DIV')).toBe('end');
  });

  it('leaves form controls and modified keys alone', () => {
    expect(keyToTraceCommand(key('ArrowRight'), 'INPUT')).toBeNull();
    expect(keyToTraceCommand(key('n'), 'select')).toBeNull();
    expect(keyToTraceCommand(key('r', { ctrlKey: true }), 'DIV')).toBeNull();
    expect(keyToTraceCommand(key('ArrowRight', { metaKey: true }), 'DIV')).toBeNull();
    expect(keyToTraceCommand(key('x'), 'DIV')).toBeNull();
  });
});
