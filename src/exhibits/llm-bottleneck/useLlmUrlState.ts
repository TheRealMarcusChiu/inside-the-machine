import { useCallback, useMemo } from 'react';
import { parseHash } from '../../lib/url/hashLocation';
import { replaceHashParams, useHashLocation } from '../../lib/useHashLocation';
import { readLlmState, writeLlmState, type LlmUrlState } from './urlConfig';

/**
 * The URL hash is the single source of truth for this exhibit's state: controls read from it and
 * write back with replaceState, so any view can be shared exactly and invalid values fall back to
 * the worked example.
 */
export function useLlmUrlState(): [LlmUrlState, (patch: Partial<LlmUrlState>) => void] {
  const { hash } = useHashLocation();
  const state = useMemo(() => readLlmState(parseHash(hash).params), [hash]);
  const update = useCallback((patch: Partial<LlmUrlState>) => {
    replaceHashParams((params) => writeLlmState({ ...readLlmState(params), ...patch }, params));
  }, []);
  return [state, update];
}
