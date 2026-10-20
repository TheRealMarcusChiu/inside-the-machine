import { describe, expect, it, vi } from 'vitest';
import { handleSimulationRequest, type SimulationRequest, type SimulationResponse } from './protocol';
import { createSimulationClient, type WorkerLike } from './simulationClient';
import { assemble } from '../exhibits/logic-to-cpu/sim/assembler';
import { getPreset } from '../exhibits/logic-to-cpu/sim/programs';

function presetPayload(id: string) {
  const asm = assemble(getPreset(id)!.source);
  if (!asm.ok) throw new Error('bad preset');
  return { program: asm.program, ram: asm.ram, maxSteps: 500 };
}

describe('simulation protocol', () => {
  it('runs a CPU trace', () => {
    const res = handleSimulationRequest({ id: 1, kind: 'cpu.trace', payload: presetPayload('add') });
    expect(res.ok).toBe(true);
    if (res.ok && res.kind === 'cpu.trace') {
      expect(res.result.reason).toBe('halted');
      expect(res.result.states.at(-1)?.outputs).toEqual([13]);
    }
  });

  it('exhaustively verifies the ripple-carry adder against integer addition', () => {
    const res = handleSimulationRequest({ id: 2, kind: 'adder.verify', payload: { width: 4 } });
    expect(res.ok && res.kind === 'adder.verify' && res.result).toEqual({ width: 4, cases: 512, mismatches: 0 });
  });

  it('returns an error response rather than throwing on bad input', () => {
    const res = handleSimulationRequest({ id: 3, kind: 'adder.verify', payload: { width: 99 } });
    expect(res).toMatchObject({ id: 3, ok: false });
    const unknown = handleSimulationRequest({ id: 4, kind: 'nope' } as unknown as SimulationRequest);
    expect(unknown).toMatchObject({ id: 4, ok: false });
  });
});

describe('simulation client', () => {
  it('falls back to inline execution when Web Workers are unavailable', async () => {
    const client = createSimulationClient({ workerFactory: () => null });
    expect(client.mode).toBe('inline');
    const result = await client.run('adder.verify', { width: 3 });
    expect(result).toEqual({ width: 3, cases: 128, mismatches: 0 });
    client.dispose();
  });

  it('routes requests through a worker and correlates responses by id', async () => {
    let onmessage: ((e: MessageEvent<SimulationResponse>) => void) | null = null;
    const posted: SimulationRequest[] = [];
    const fake: WorkerLike = {
      postMessage: (msg: SimulationRequest) => {
        posted.push(msg);
        // Respond asynchronously and out of order to prove id correlation.
        setTimeout(() => onmessage?.({ data: handleSimulationRequest(msg) } as MessageEvent<SimulationResponse>), msg.id === 1 ? 20 : 0);
      },
      terminate: vi.fn(),
      set onmessage(fn) {
        onmessage = fn;
      },
      get onmessage() {
        return onmessage;
      },
      onerror: null,
    };
    const client = createSimulationClient({ workerFactory: () => fake });
    expect(client.mode).toBe('worker');
    const [a, b] = await Promise.all([client.run('adder.verify', { width: 2 }), client.run('adder.verify', { width: 3 })]);
    expect(a.cases).toBe(32);
    expect(b.cases).toBe(128);
    expect(posted.map((p) => p.id)).toEqual([1, 2]);
    client.dispose();
    expect(fake.terminate).toHaveBeenCalled();
  });

  it('rejects with the worker’s error message', async () => {
    const fake: WorkerLike = {
      postMessage(msg: SimulationRequest) {
        queueMicrotask(() => this.onmessage?.({ data: { id: msg.id, ok: false, error: 'boom' } } as MessageEvent<SimulationResponse>));
      },
      terminate: () => {},
      onmessage: null,
      onerror: null,
    };
    const client = createSimulationClient({ workerFactory: () => fake });
    await expect(client.run('adder.verify', { width: 2 })).rejects.toThrow('boom');
  });

  it('rejects pending work after dispose', async () => {
    const fake: WorkerLike = { postMessage: () => {}, terminate: () => {}, onmessage: null, onerror: null };
    const client = createSimulationClient({ workerFactory: () => fake });
    const pending = client.run('adder.verify', { width: 2 });
    client.dispose();
    await expect(pending).rejects.toThrow(/disposed/i);
  });
});
