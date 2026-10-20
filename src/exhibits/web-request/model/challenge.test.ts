import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, type Conditions } from './journey';
import { CHALLENGES, checkDatabaseBottleneck, checkOneRoundTrip } from './challenge';

const withC = (patch: Partial<Conditions>): Conditions => ({ ...DEFAULT_CONDITIONS, ...patch });

describe('challenge prompts', () => {
  it('has two challenges with prompts', () => {
    expect(CHALLENGES.map((c) => c.id)).toEqual(['one-round-trip', 'db-bottleneck']);
    for (const c of CHALLENGES) expect(c.prompt.length).toBeGreaterThan(20);
  });
});

describe('checkOneRoundTrip: fresh data from the database in a single round trip', () => {
  it('is not solved by the first-visit defaults, and the hint counts round trips', () => {
    const r = checkOneRoundTrip(DEFAULT_CONDITIONS);
    expect(r.solved).toBe(false);
    expect(r.hint).toMatch(/4 round trips/);
  });

  it('is solved by reusing the connection', () => {
    expect(checkOneRoundTrip(withC({ connection: 'reused' })).solved).toBe(true);
  });

  it('is also solved by HTTP/3 with 0-RTT and a warm DNS cache', () => {
    expect(checkOneRoundTrip(withC({ protocol: 'h3', tls: 'early', dns: 'warm' })).solved).toBe(true);
  });

  it('does not count answers that never reach the database', () => {
    const fresh = checkOneRoundTrip(withC({ httpCache: 'fresh' }));
    expect(fresh.solved).toBe(false);
    expect(fresh.hint).toMatch(/database/i);
    expect(checkOneRoundTrip(withC({ connection: 'reused', appCache: 'hit' })).solved).toBe(false);
  });
});

describe('checkDatabaseBottleneck: database over half the time on a new connection', () => {
  it('reports the current database share when unsolved', () => {
    const r = checkDatabaseBottleneck(DEFAULT_CONDITIONS);
    expect(r.solved).toBe(false);
    expect(r.hint).toMatch(/2%/);
  });

  it('is solved when the query dominates', () => {
    expect(checkDatabaseBottleneck(withC({ rttMs: 5, dbMs: 100 })).solved).toBe(true);
  });

  it('requires a new connection and a database visit', () => {
    expect(checkDatabaseBottleneck(withC({ connection: 'reused', dbMs: 500 })).solved).toBe(false);
    expect(checkDatabaseBottleneck(withC({ appCache: 'hit', rttMs: 5, dbMs: 500 })).solved).toBe(false);
  });
});
