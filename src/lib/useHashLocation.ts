import { useCallback, useSyncExternalStore } from 'react';
import { formatHash, parseHash, type HashLocation } from './url/hashLocation';

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  window.addEventListener('itm:replace-hash', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener('itm:replace-hash', onChange);
  };
}

const getSnapshot = () => window.location.hash;

/** Current hash route, re-rendering on navigation. */
export function useHashLocation(): HashLocation & { hash: string } {
  const hash = useSyncExternalStore(subscribe, getSnapshot, () => '');
  return { hash, ...parseHash(hash) };
}

/**
 * Replace the query part of the current hash without adding history entries
 * (dragging a control should not flood the back button).
 */
export function replaceHashParams(update: (params: URLSearchParams) => URLSearchParams) {
  const { path, params } = parseHash(window.location.hash);
  const next = formatHash(path, update(params));
  if (next === window.location.hash) return;
  const url = `${window.location.pathname}${window.location.search}${next}`;
  window.history.replaceState(window.history.state, '', url);
  window.dispatchEvent(new Event('itm:replace-hash'));
}

export function useReplaceHashParams() {
  return useCallback(replaceHashParams, []);
}
