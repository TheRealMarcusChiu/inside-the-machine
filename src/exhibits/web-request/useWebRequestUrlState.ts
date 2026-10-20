import { useCallback, useMemo } from 'react';
import { parseHash } from '../../lib/url/hashLocation';
import { replaceHashParams, useHashLocation } from '../../lib/useHashLocation';
import { readWebRequestState, writeWebRequestState, type WebRequestUrlState } from './urlConfig';

/**
 * The URL hash is the single source of truth for the exhibit's shareable state:
 * every control reads from it and writes back with replaceState, so any view can be
 * shared exactly, and invalid values fall back to the worked example.
 */
export function useWebRequestUrlState(): [WebRequestUrlState, (patch: Partial<WebRequestUrlState>) => void] {
  const { hash } = useHashLocation();
  const state = useMemo(() => readWebRequestState(parseHash(hash).params), [hash]);
  const update = useCallback((patch: Partial<WebRequestUrlState>) => {
    replaceHashParams((params) => writeWebRequestState({ ...readWebRequestState(params), ...patch }, params));
  }, []);
  return [state, update];
}
