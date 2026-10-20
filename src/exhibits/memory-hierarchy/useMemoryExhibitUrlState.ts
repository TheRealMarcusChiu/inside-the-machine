import { useCallback, useMemo } from 'react';
import { parseHash } from '../../lib/url/hashLocation';
import { replaceHashParams, useHashLocation } from '../../lib/useHashLocation';
import { readMemoryExhibitState, writeMemoryExhibitState, type MemoryExhibitUrlState } from './urlConfig';

/**
 * The URL hash is the single source of truth for this exhibit's shareable state.
 * Controls write back with replaceState (no history flood); unrelated parameters
 * in the hash are carried over untouched.
 */
export function useMemoryExhibitUrlState(): [MemoryExhibitUrlState, (patch: Partial<MemoryExhibitUrlState>) => void] {
  const { hash } = useHashLocation();
  const state = useMemo(() => readMemoryExhibitState(parseHash(hash).params), [hash]);
  const update = useCallback((patch: Partial<MemoryExhibitUrlState>) => {
    replaceHashParams((params) => writeMemoryExhibitState({ ...readMemoryExhibitState(params), ...patch }, params));
  }, []);
  return [state, update];
}
