import { describe, expect, it } from 'vitest';
import { allConditionCombinations, buildJourney } from './journey';
import { SOURCE_ORDER, SOURCES } from './sources';

describe('sources', () => {
  it('lists every source exactly once, in display order', () => {
    expect([...SOURCE_ORDER].sort()).toEqual(Object.keys(SOURCES).sort());
  });

  it('includes the required RFCs and the Spring Framework documentation', () => {
    const shorts = SOURCE_ORDER.map((id) => SOURCES[id].short);
    expect(shorts).toEqual(expect.arrayContaining(['RFC 1034', 'RFC 8446', 'RFC 9110', 'Spring Web MVC']));
    expect(SOURCES['spring-mvc'].url).toMatch(/^https:\/\/docs\.spring\.io\/spring-framework\//);
    for (const id of SOURCE_ORDER) expect(SOURCES[id].url).toMatch(/^https:\/\//);
  });

  it('every source a step cites is defined', () => {
    for (const c of allConditionCombinations([50], [4])) {
      for (const s of buildJourney(c).steps) for (const id of s.source) expect(SOURCES[id]).toBeDefined();
    }
  });
});
