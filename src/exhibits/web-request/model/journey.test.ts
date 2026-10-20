import { describe, expect, it } from 'vitest';
import {
  ACTORS,
  ALL_CONDITION_VALUES,
  ASSUMED_MS,
  DEFAULT_CONDITIONS,
  allConditionCombinations,
  buildJourney,
  compareJourneys,
  formatMs,
  type Conditions,
  type StepId,
} from './journey';

const activeIds = (c: Conditions) => buildJourney(c).active.map((s) => s.id);
const step = (c: Conditions, id: StepId) => buildJourney(c).steps.find((s) => s.id === id);
const withC = (patch: Partial<Conditions>): Conditions => ({ ...DEFAULT_CONDITIONS, ...patch });

describe('default conditions: a first visit over HTTP/2', () => {
  const j = buildJourney(DEFAULT_CONDITIONS);

  it('is a cold, new-connection, uncached HTTPS request at 50 ms RTT', () => {
    expect(DEFAULT_CONDITIONS).toEqual({
      dns: 'cold',
      connection: 'new',
      tls: 'full',
      protocol: 'h2',
      httpCache: 'miss',
      appCache: 'miss',
      rttMs: 50,
      dbMs: 4,
    });
  });

  it('walks DNS → TCP → TLS → HTTP → Spring → database → response in order', () => {
    expect(j.active.map((s) => s.id)).toEqual([
      'browser-cache',
      'dns',
      'tcp',
      'tls',
      'request',
      'dispatch',
      'app-cache',
      'database',
      'serialize',
      'response',
      'deliver',
    ]);
  });

  it('does not list a QUIC step for HTTP/2', () => {
    expect(j.steps.some((s) => s.id === 'quic')).toBe(false);
  });

  it('costs four round trips plus server time', () => {
    expect(j.roundTrips).toBe(4);
    const server = ASSUMED_MS.dispatch + ASSUMED_MS.appCache + ASSUMED_MS.dbNetwork + 4 + ASSUMED_MS.serialize;
    expect(j.totalMs).toBeCloseTo(4 * 50 + server, 6);
    expect(j.totalMs).toBeCloseTo(205.6, 6);
  });

  it('reaches the server and the database and returns 200 OK', () => {
    expect(j.reachesServer).toBe(true);
    expect(j.reachesDatabase).toBe(true);
    expect(j.status).toBe('200 OK');
  });

  it('times each network step from the RTT', () => {
    expect(step(DEFAULT_CONDITIONS, 'dns')?.durationMs).toBe(50);
    expect(step(DEFAULT_CONDITIONS, 'tcp')?.durationMs).toBe(50);
    expect(step(DEFAULT_CONDITIONS, 'tls')?.durationMs).toBe(50);
    expect(step(DEFAULT_CONDITIONS, 'request')?.durationMs).toBe(25);
    expect(step(DEFAULT_CONDITIONS, 'response')?.durationMs).toBe(25);
    expect(step(DEFAULT_CONDITIONS, 'database')?.durationMs).toBeCloseTo(ASSUMED_MS.dbNetwork + 4, 6);
  });

  it('lays steps end to end: each starts when the previous active step ends', () => {
    let clock = 0;
    for (const s of j.active) {
      expect(s.startMs).toBeCloseTo(clock, 6);
      clock += s.durationMs;
    }
    expect(clock).toBeCloseTo(j.totalMs, 6);
  });

  it('cites a specification or documentation for every step', () => {
    for (const s of j.steps) expect(s.source.length).toBeGreaterThan(0);
  });
});

describe('conditions change the path', () => {
  it('a warm DNS cache skips the DNS query and says why', () => {
    const dns = step(withC({ dns: 'warm' }), 'dns');
    expect(dns?.status).toBe('skipped');
    expect(dns?.durationMs).toBe(0);
    expect(dns?.skipReason).toMatch(/cache/i);
    expect(buildJourney(withC({ dns: 'warm' })).roundTrips).toBe(3);
  });

  it('a reused connection skips DNS, TCP and TLS: one round trip', () => {
    const c = withC({ connection: 'reused' });
    expect(activeIds(c)).not.toContain('dns');
    expect(activeIds(c)).not.toContain('tcp');
    expect(activeIds(c)).not.toContain('tls');
    expect(step(c, 'tcp')?.skipReason).toMatch(/already open/i);
    const j = buildJourney(c);
    expect(j.roundTrips).toBe(1);
    expect(j.totalMs).toBeCloseTo(55.6, 6);
  });

  it('TLS resumption keeps one round trip but sends no certificate', () => {
    const full = step(DEFAULT_CONDITIONS, 'tls')!;
    const resumed = step(withC({ tls: 'resumed' }), 'tls')!;
    expect(resumed.durationMs).toBe(full.durationMs);
    expect(full.outcome).toMatch(/certificate/i);
    expect(resumed.outcome).toMatch(/no certificate/i);
  });

  it('0-RTT early data sends the request alongside the handshake, saving a round trip', () => {
    const c = withC({ tls: 'early' });
    expect(step(c, 'tls')?.durationMs).toBe(0);
    expect(step(c, 'tls')?.status).toBe('active');
    expect(buildJourney(c).roundTrips).toBe(3);
  });

  it('HTTP/3 replaces TCP + TLS with a single QUIC handshake', () => {
    const c = withC({ protocol: 'h3' });
    expect(activeIds(c)).toContain('quic');
    expect(step(c, 'tcp')?.status).toBe('skipped');
    expect(step(c, 'tcp')?.skipReason).toMatch(/udp/i);
    expect(step(c, 'tls')?.status).toBe('skipped');
    expect(step(c, 'tls')?.skipReason).toMatch(/quic/i);
    expect(step(c, 'quic')?.durationMs).toBe(50);
    expect(buildJourney(c).roundTrips).toBe(3);
  });

  it('HTTP/3 with 0-RTT and a warm DNS cache reaches the server in one round trip', () => {
    expect(buildJourney(withC({ protocol: 'h3', tls: 'early', dns: 'warm' })).roundTrips).toBe(1);
  });

  it('a fresh browser-cache entry answers with no network at all', () => {
    const j = buildJourney(withC({ httpCache: 'fresh' }));
    expect(j.active.map((s) => s.id)).toEqual(['browser-cache', 'deliver']);
    expect(j.totalMs).toBe(0);
    expect(j.roundTrips).toBe(0);
    expect(j.reachesServer).toBe(false);
    expect(j.reachesDatabase).toBe(false);
    expect(j.status).toMatch(/from browser cache/i);
    for (const s of j.steps.filter((x) => x.status === 'skipped')) expect(s.skipReason).toBeTruthy();
  });

  it('a stale entry revalidates: the full server path runs and returns 304 without a body', () => {
    const c = withC({ httpCache: 'stale' });
    const j = buildJourney(c);
    expect(j.status).toBe('304 Not Modified');
    expect(j.reachesDatabase).toBe(true);
    expect(step(c, 'request')?.outcome).toMatch(/If-None-Match/);
    expect(step(c, 'serialize')?.outcome).toMatch(/304/);
  });

  it('a server-side cache hit skips the database', () => {
    const c = withC({ appCache: 'hit' });
    const j = buildJourney(c);
    expect(j.reachesDatabase).toBe(false);
    expect(step(c, 'database')?.status).toBe('skipped');
    expect(step(c, 'database')?.skipReason).toMatch(/cache/i);
    expect(j.totalMs).toBeLessThan(buildJourney(DEFAULT_CONDITIONS).totalMs);
  });

  it('scales with RTT and database time', () => {
    expect(buildJourney(withC({ rttMs: 100 })).totalMs).toBeCloseTo(405.6, 6);
    expect(buildJourney(withC({ dbMs: 104 })).totalMs).toBeCloseTo(305.6, 6);
  });
});

describe('invariants over every combination of conditions', () => {
  const combos = allConditionCombinations([5, 50, 300], [1, 200]);

  it('enumerates every discrete combination', () => {
    const discrete = Object.values(ALL_CONDITION_VALUES).reduce((n, values) => n * values.length, 1);
    expect(combos.length).toBe(discrete * 3 * 2);
  });

  it('the browser never talks directly to the database', () => {
    for (const c of combos) {
      for (const s of buildJourney(c).steps) {
        const pair = [s.from, s.to];
        if (pair.includes('db')) expect(pair).toContain('app');
      }
    }
  });

  it('skipped steps take no time and always explain themselves; totals add up', () => {
    for (const c of combos) {
      const j = buildJourney(c);
      for (const s of j.steps) {
        if (s.status === 'skipped') {
          expect(s.durationMs).toBe(0);
          expect(s.skipReason).toBeTruthy();
        }
      }
      const sum = j.active.reduce((t, s) => t + s.durationMs, 0);
      expect(j.totalMs).toBeCloseTo(sum, 6);
      expect(j.active[0]?.id).toBe('browser-cache');
      expect(j.active.at(-1)?.id).toBe('deliver');
      if (j.reachesDatabase) expect(j.reachesServer).toBe(true);
    }
  });

  it('every step names known actors', () => {
    const ids = new Set(ACTORS.map((a) => a.id));
    for (const c of combos) for (const s of buildJourney(c).steps) expect(ids.has(s.from) && ids.has(s.to)).toBe(true);
  });
});

describe('compareJourneys', () => {
  it('reports the time and round trips saved and which steps dropped out', () => {
    const d = compareJourneys(buildJourney(DEFAULT_CONDITIONS), buildJourney(withC({ connection: 'reused' })));
    expect(d.savedMs).toBeCloseTo(150, 6);
    expect(d.savedRoundTrips).toBe(3);
    expect(d.newlySkipped).toEqual(['dns', 'tcp', 'tls']);
  });

  it('reports nothing saved for identical conditions', () => {
    const d = compareJourneys(buildJourney(DEFAULT_CONDITIONS), buildJourney(DEFAULT_CONDITIONS));
    expect(d).toEqual({ savedMs: 0, savedRoundTrips: 0, newlySkipped: [] });
  });
});

describe('formatMs', () => {
  it('shows whole milliseconds without decimals and fractions to one place', () => {
    expect(formatMs(50)).toBe('50 ms');
    expect(formatMs(205.6)).toBe('205.6 ms');
    expect(formatMs(0.1 + 0.2)).toBe('0.3 ms');
    expect(formatMs(0)).toBe('0 ms');
  });
});
