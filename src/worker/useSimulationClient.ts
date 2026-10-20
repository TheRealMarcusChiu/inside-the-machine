import { useEffect, useRef, type RefObject } from 'react';
import { createSimulationClient, type SimulationClient } from './simulationClient';

/** A simulation client owned by the calling component; disposed (and its worker terminated) on unmount. */
export function useSimulationClient(): RefObject<SimulationClient | null> {
  const ref = useRef<SimulationClient | null>(null);
  useEffect(() => {
    const client = createSimulationClient();
    ref.current = client;
    return () => {
      client.dispose();
      ref.current = null;
    };
  }, []);
  return ref;
}
