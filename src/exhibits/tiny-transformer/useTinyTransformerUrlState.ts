import { useCallback, useMemo } from 'react';
import { parseHash } from '../../lib/url/hashLocation';
import { replaceHashParams, useHashLocation } from '../../lib/useHashLocation';
import { readTinyState, writeTinyState, type TinyTransformerState } from './urlConfig';

/**
 * The URL hash is the single source of truth for this exhibit's shareable state — the
 * Q/K/V numbers, walkthrough stage, explained row, guide frame and depth — so any view can
 * be copied as a link. Invalid values fall back to the worked example.
 */
export function useTinyTransformerUrlState(): [TinyTransformerState, (patch: Partial<TinyTransformerState>) => void] {
  const { hash } = useHashLocation();
  const state = useMemo(() => readTinyState(parseHash(hash).params), [hash]);
  const update = useCallback((patch: Partial<TinyTransformerState>) => {
    replaceHashParams((params) => writeTinyState({ ...readTinyState(params), ...patch }, params));
  }, []);
  return [state, update];
}
