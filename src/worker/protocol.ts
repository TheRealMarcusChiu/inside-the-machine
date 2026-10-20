/**
 * Message protocol shared by the simulation Web Worker and the inline fallback.
 * Add a new simulation by extending SimulationJobs and handling it below.
 */
import { add4, rippleAdd } from '../exhibits/logic-to-cpu/sim/adder';
import { createCpu, runTrace, type CpuTrace, type Instruction } from '../exhibits/logic-to-cpu/sim/cpu';

export interface SimulationJobs {
  'cpu.trace': {
    payload: { program: Instruction[]; ram: number[]; maxSteps: number };
    result: CpuTrace;
  };
  'adder.verify': {
    payload: { width: number };
    result: { width: number; cases: number; mismatches: number };
  };
}

export type JobKind = keyof SimulationJobs;

export type SimulationRequest = {
  [K in JobKind]: { id: number; kind: K; payload: SimulationJobs[K]['payload'] };
}[JobKind];

export type SimulationResponse =
  | { [K in JobKind]: { id: number; ok: true; kind: K; result: SimulationJobs[K]['result'] } }[JobKind]
  | { id: number; ok: false; error: string };

export const MAX_TRACE_STEPS = 10_000;
export const MAX_VERIFY_WIDTH = 8;

function verifyAdder(width: number): SimulationJobs['adder.verify']['result'] {
  if (!Number.isInteger(width) || width < 1 || width > MAX_VERIFY_WIDTH) {
    throw new RangeError(`width must be 1–${MAX_VERIFY_WIDTH}`);
  }
  const limit = 2 ** width;
  let cases = 0;
  let mismatches = 0;
  for (let a = 0; a < limit; a++) {
    for (let b = 0; b < limit; b++) {
      for (const cin of [0, 1] as const) {
        const r = width === 4 ? add4(a, b, cin) : rippleAdd(a, b, width, cin);
        const total = a + b + cin;
        if (r.sum !== total % limit || r.carryOut !== (total >= limit ? 1 : 0)) mismatches++;
        cases++;
      }
    }
  }
  return { width, cases, mismatches };
}

/** Pure request handler: never throws, always answers with the request id. */
export function handleSimulationRequest(req: SimulationRequest): SimulationResponse {
  try {
    switch (req.kind) {
      case 'cpu.trace': {
        const { program, ram, maxSteps } = req.payload;
        const budget = Math.min(Math.max(0, Math.floor(maxSteps)), MAX_TRACE_STEPS);
        return { id: req.id, ok: true, kind: 'cpu.trace', result: runTrace(createCpu(program, ram), budget) };
      }
      case 'adder.verify':
        return { id: req.id, ok: true, kind: 'adder.verify', result: verifyAdder(req.payload.width) };
      default:
        return { id: (req as { id: number }).id, ok: false, error: `unknown job kind “${(req as { kind: string }).kind}”` };
    }
  } catch (err) {
    return { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
