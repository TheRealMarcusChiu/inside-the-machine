import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type MotionSetting = 'system' | 'reduce' | 'full';

export const MOTION_STORAGE_KEY = 'itm:motion';
const QUERY = '(prefers-reduced-motion: reduce)';

export function parseMotionSetting(raw: string | null | undefined): MotionSetting {
  return raw === 'reduce' || raw === 'full' ? raw : 'system';
}

export function resolveReducedMotion(setting: MotionSetting, systemPrefersReduced: boolean): boolean {
  if (setting === 'reduce') return true;
  if (setting === 'full') return false;
  return systemPrefersReduced;
}

export function nextMotionSetting(setting: MotionSetting): MotionSetting {
  return setting === 'system' ? 'reduce' : setting === 'reduce' ? 'full' : 'system';
}

function readStoredSetting(): MotionSetting {
  try {
    return parseMotionSetting(window.localStorage.getItem(MOTION_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

function systemPrefersReduced(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

interface MotionContextValue {
  setting: MotionSetting;
  reducedMotion: boolean;
  setSetting: (s: MotionSetting) => void;
}

const MotionContext = createContext<MotionContextValue>({
  setting: 'system',
  reducedMotion: false,
  setSetting: () => {},
});

export function MotionProvider({ children }: { children: ReactNode }) {
  const [setting, setSettingState] = useState<MotionSetting>(readStoredSetting);
  const [systemReduced, setSystemReduced] = useState(systemPrefersReduced);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setSystemReduced(mql.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  const reducedMotion = resolveReducedMotion(setting, systemReduced);

  useEffect(() => {
    // CSS hooks: [data-motion="reduce"] disables decorative animation globally.
    document.documentElement.dataset.motion = reducedMotion ? 'reduce' : 'full';
  }, [reducedMotion]);

  const setSetting = useCallback((s: MotionSetting) => {
    setSettingState(s);
    try {
      if (s === 'system') window.localStorage.removeItem(MOTION_STORAGE_KEY);
      else window.localStorage.setItem(MOTION_STORAGE_KEY, s);
    } catch {
      /* storage may be unavailable (private mode); the setting still applies for this visit */
    }
  }, []);

  const value = useMemo(() => ({ setting, reducedMotion, setSetting }), [setting, reducedMotion, setSetting]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotion(): MotionContextValue {
  return useContext(MotionContext);
}
