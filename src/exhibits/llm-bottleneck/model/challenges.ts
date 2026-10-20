import { estimatePhase, footprintBytes, normaliseConfig, WORKED_EXAMPLE, type LlmConfig } from './bottleneck';
import { formatBytes, formatIntensity, sig3 } from './format';

export type ChallengeId = 'cross-ridge' | 'fit-memory';

export interface Challenge {
  id: ChallengeId;
  title: string;
  prompt: string;
  hint: string;
}

export interface ChallengeResult {
  solved: boolean;
  detail: string;
}

const MIN_CONTEXT = 4096;
const MIN_PARAMS_B = 7;
const MIN_BATCH = 32;
const MEMORY_BUDGET_BYTES = 80e9;

export const CHALLENGES: readonly Challenge[] = [
  {
    id: 'cross-ridge',
    title: 'Cross the ridge',
    prompt: `On the worked-example machine (${WORKED_EXAMPLE.peakTflops} TFLOP/s, ${WORKED_EXAMPLE.bandwidthTBs} TB/s), make decode compute-bound with at least ${MIN_CONTEXT.toLocaleString('en-US')} tokens of context and at least ${MIN_PARAMS_B}B parameters.`,
    hint: 'Raising the batch shares the weight bytes, but every sequence still reads its own KV cache. Try batch 1024 first, then ask what would make each sequence’s cache smaller.',
  },
  {
    id: 'fit-memory',
    title: 'Fit the cache',
    prompt: `Serve a batch of at least ${MIN_BATCH} sequences at ${MIN_CONTEXT.toLocaleString('en-US')}+ tokens with a model of at least ${MIN_PARAMS_B}B parameters, keeping weights + KV cache within ${formatBytes(MEMORY_BUDGET_BYTES)}.`,
    hint: 'At batch 32 the KV cache outweighs the model. Fewer KV heads (grouped-query attention) or fewer bytes per number both shrink it.',
  },
];

function rules(c: LlmConfig): string | undefined {
  if (c.context < MIN_CONTEXT) return `Context must stay at ${MIN_CONTEXT.toLocaleString('en-US')}+ tokens.`;
  if (c.paramsB < MIN_PARAMS_B) return `The model must keep at least ${MIN_PARAMS_B}B parameters.`;
  return undefined;
}

export function checkChallenge(id: ChallengeId, raw: LlmConfig): ChallengeResult {
  const { config: c } = normaliseConfig(raw);
  const broken = rules(c);
  if (id === 'cross-ridge') {
    if (c.peakTflops !== WORKED_EXAMPLE.peakTflops || c.bandwidthTBs !== WORKED_EXAMPLE.bandwidthTBs) {
      return { solved: false, detail: 'Keep the worked-example machine: 312 TFLOP/s and 2 TB/s.' };
    }
    if (broken) return { solved: false, detail: broken };
    const e = estimatePhase(c, 'decode');
    const verdict = `Decode intensity is ${formatIntensity(e.intensity)}; the ridge is at ${sig3(e.ridge)} FLOP/byte.`;
    return e.bound === 'compute'
      ? { solved: true, detail: `${verdict} The step is now limited by arithmetic, not bytes.` }
      : { solved: false, detail: `${verdict} Still bandwidth-bound.` };
  }
  if (broken) return { solved: false, detail: broken };
  if (c.batch < MIN_BATCH) return { solved: false, detail: `Batch must be at least ${MIN_BATCH}; it is ${c.batch}.` };
  const footprint = footprintBytes(c);
  const verdict = `Weights + KV cache = ${formatBytes(footprint)} against a budget of ${formatBytes(MEMORY_BUDGET_BYTES)}.`;
  return footprint <= MEMORY_BUDGET_BYTES
    ? { solved: true, detail: `${verdict} It fits.` }
    : { solved: false, detail: `${verdict} Over budget.` };
}
