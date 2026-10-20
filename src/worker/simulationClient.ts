import { handleSimulationRequest, type JobKind, type SimulationJobs, type SimulationRequest, type SimulationResponse } from './protocol';

/** The subset of the Worker API the client relies on (lets tests inject fakes). */
export interface WorkerLike {
  postMessage(message: SimulationRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<SimulationResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export interface SimulationClient {
  readonly mode: 'worker' | 'inline';
  run<K extends JobKind>(kind: K, payload: SimulationJobs[K]['payload']): Promise<SimulationJobs[K]['result']>;
  dispose(): void;
}

export interface SimulationClientOptions {
  /** Return null to force inline execution. Defaults to a real module worker when supported. */
  workerFactory?: () => WorkerLike | null;
}

function defaultWorkerFactory(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
  } catch {
    return null;
  }
}

interface Pending {
  resolve: (value: never) => void;
  reject: (err: Error) => void;
}

/**
 * Runs simulations off the main thread when Web Workers exist, otherwise inline
 * (tests, very old browsers). Callers see the same Promise API either way.
 */
export function createSimulationClient(options: SimulationClientOptions = {}): SimulationClient {
  let worker = (options.workerFactory ?? defaultWorkerFactory)();
  let nextId = 1;
  let disposed = false;
  const pending = new Map<number, Pending>();

  const settle = (res: SimulationResponse) => {
    const p = pending.get(res.id);
    if (!p) return;
    pending.delete(res.id);
    if (res.ok) p.resolve(res.result as never);
    else p.reject(new Error(res.error));
  };

  if (worker) {
    worker.onmessage = (event) => settle(event.data);
    worker.onerror = (event) => {
      const err = new Error(event.message || 'simulation worker failed');
      for (const p of pending.values()) p.reject(err);
      pending.clear();
    };
  }

  return {
    mode: worker ? 'worker' : 'inline',
    run(kind, payload) {
      if (disposed) return Promise.reject(new Error('simulation client disposed'));
      const request = { id: nextId++, kind, payload } as SimulationRequest;
      return new Promise((resolve, reject) => {
        if (!worker) {
          const res = handleSimulationRequest(request);
          if (res.ok) resolve(res.result as never);
          else reject(new Error(res.error));
          return;
        }
        pending.set(request.id, { resolve: resolve as (v: never) => void, reject });
        worker.postMessage(request);
      });
    },
    dispose() {
      disposed = true;
      worker?.terminate();
      worker = null;
      const err = new Error('simulation client disposed');
      for (const p of pending.values()) p.reject(err);
      pending.clear();
    },
  };
}
