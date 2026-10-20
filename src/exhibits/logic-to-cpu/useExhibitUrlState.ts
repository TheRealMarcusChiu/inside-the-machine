import { useCallback, useMemo } from 'react';
import { parseHash } from '../../lib/url/hashLocation';
import { replaceHashParams, useHashLocation } from '../../lib/useHashLocation';
import { readExhibitState, writeExhibitState, type ExhibitUrlState } from './urlConfig';

/**
 * The URL hash is the single source of truth for the exhibit's shareable state:
 * every control reads from it and writes back with replaceState, so any view can be
 * shared or bookmarked exactly, and invalid values fall back to the worked example.
 */
export function useExhibitUrlState(): [ExhibitUrlState, (patch: Partial<ExhibitUrlState>) => void] {
  const { hash } = useHashLocation();
  const state = useMemo(() => readExhibitState(parseHash(hash).params), [hash]);
  const update = useCallback((patch: Partial<ExhibitUrlState>) => {
    replaceHashParams((params) => writeExhibitState({ ...readExhibitState(params), ...patch }, params));
  }, []);
  return [state, update];
}
