import { useCallback, useMemo } from 'react';
import { parseHash } from '../../lib/url/hashLocation';
import { replaceHashParams, useHashLocation } from '../../lib/useHashLocation';
import { applyPatch, readZfsState, writeZfsState, type ZfsUrlState } from './urlConfig';

/**
 * The URL hash is the single source of truth for the pool being explored: every control reads from it and
 * writes back with replaceState, so a link reproduces the pool and its failure sequence exactly.
 */
export function useZfsUrlState(): [ZfsUrlState, (patch: Partial<ZfsUrlState>) => void] {
  const { hash } = useHashLocation();
  const state = useMemo(() => readZfsState(parseHash(hash).params), [hash]);
  const update = useCallback((patch: Partial<ZfsUrlState>) => {
    replaceHashParams((params) => writeZfsState(applyPatch(readZfsState(params), patch), params));
  }, []);
  return [state, update];
}
