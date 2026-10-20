import { WORKED_EXAMPLE, type LlmConfig } from './bottleneck';

export interface Preset<K extends keyof LlmConfig> {
  id: string;
  label: string;
  values: Pick<LlmConfig, K>;
}

type ModelKeys = 'paramsB' | 'layers' | 'heads' | 'kvHeads' | 'headDim';
type MachineKeys = 'peakTflops' | 'bandwidthTBs';

/** Architecture shapes from the published model cards / papers, with parameter counts rounded. */
export const MODEL_PRESETS: readonly Preset<ModelKeys>[] = [
  {
    id: '7b-mha',
    label: '7B · MHA (Llama-2-7B-shaped)',
    values: {
      paramsB: WORKED_EXAMPLE.paramsB,
      layers: WORKED_EXAMPLE.layers,
      heads: WORKED_EXAMPLE.heads,
      kvHeads: WORKED_EXAMPLE.kvHeads,
      headDim: WORKED_EXAMPLE.headDim,
    },
  },
  { id: '8b-gqa', label: '8B · GQA (Llama-3-8B-shaped)', values: { paramsB: 8, layers: 32, heads: 32, kvHeads: 8, headDim: 128 } },
  { id: '70b-gqa', label: '70B · GQA (Llama-3-70B-shaped)', values: { paramsB: 70, layers: 80, heads: 64, kvHeads: 8, headDim: 128 } },
];

/** Illustrative round numbers at the scale of real parts — not the specification of any product. */
export const MACHINE_PRESETS: readonly Preset<MachineKeys>[] = [
  { id: 'dc-2020', label: 'Data-centre, 2020 scale (312 TFLOP/s, 2 TB/s)', values: { peakTflops: 312, bandwidthTBs: 2 } },
  { id: 'dc-2022', label: 'Data-centre, 2022 scale (990 TFLOP/s, 3.35 TB/s)', values: { peakTflops: 990, bandwidthTBs: 3.35 } },
  { id: 'laptop', label: 'Laptop-class (15 TFLOP/s, 0.12 TB/s)', values: { peakTflops: 15, bandwidthTBs: 0.12 } },
];
