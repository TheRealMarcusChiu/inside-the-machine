import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS } from './model/journey';
import { DEFAULT_WEB_REQUEST_STATE, readWebRequestState, toConditions, writeWebRequestState } from './urlConfig';

describe('web request URL state', () => {
  it('defaults to the worked example: short text, first-visit conditions, trace at the start', () => {
    expect(DEFAULT_WEB_REQUEST_STATE).toEqual({ depth: 'short', step: 0, ...DEFAULT_CONDITIONS });
    expect(toConditions(DEFAULT_WEB_REQUEST_STATE)).toEqual(DEFAULT_CONDITIONS);
  });

  it('omits defaults so links stay short', () => {
    expect(writeWebRequestState(DEFAULT_WEB_REQUEST_STATE).toString()).toBe('');
  });

  it('round-trips every field', () => {
    const state = {
      depth: 'deep',
      step: 3,
      dns: 'warm',
      connection: 'reused',
      tls: 'early',
      protocol: 'h3',
      httpCache: 'stale',
      appCache: 'hit',
      rttMs: 120,
      dbMs: 30,
    } as const;
    const params = writeWebRequestState(state);
    expect(params.toString()).toBe('depth=deep&step=3&dns=warm&conn=reused&tls=early&proto=h3&hc=stale&ac=hit&rtt=120&db=30');
    expect(readWebRequestState(params)).toEqual(state);
  });

  it('falls back to defaults for tampered or out-of-range values', () => {
    const s = readWebRequestState(new URLSearchParams('dns=hot&conn=1&tls=&proto=h9&hc=x&ac=yes&rtt=0&db=99999&step=-1'));
    expect(s).toEqual(DEFAULT_WEB_REQUEST_STATE);
  });

  it('keeps unrelated parameters such as the section anchor', () => {
    const params = writeWebRequestState({ ...DEFAULT_WEB_REQUEST_STATE, rttMs: 80 }, new URLSearchParams('at=sources'));
    expect(params.get('at')).toBe('sources');
    expect(params.get('rtt')).toBe('80');
  });
});
