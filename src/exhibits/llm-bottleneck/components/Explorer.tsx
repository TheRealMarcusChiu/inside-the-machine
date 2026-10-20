import { useId } from 'react';
import { ExhibitFigure } from '../../../components/ExhibitFigure';
import type { PhaseEstimate } from '../model/bottleneck';
import { formatBytes, formatFlops, formatIntensity, formatRate, formatSeconds, formatTokensPerSecond, sig3 } from '../model/format';
import { MACHINE_PRESETS, MODEL_PRESETS } from '../model/presets';
import { PRECISIONS, type LlmUrlState, type NumericField } from '../urlConfig';
import { NumberField } from './NumberField';

export const EXPLORER_FIGURE_ID = 'llm-explorer-figure';

const MODEL_FIELDS: { field: NumericField; label: string; name: string }[] = [
  { field: 'paramsB', label: 'Parameters (billions)', name: 'parameter count' },
  { field: 'layers', label: 'Layers (L)', name: 'layers' },
  { field: 'heads', label: 'Query heads (H)', name: 'query heads' },
  { field: 'kvHeads', label: 'KV heads (Hkv)', name: 'KV heads' },
  { field: 'headDim', label: 'Head dimension (dh)', name: 'head dimension' },
];

const WORKLOAD_FIELDS: { field: NumericField; label: string; name: string }[] = [
  { field: 'context', label: 'Context length (T, tokens)', name: 'context length' },
  { field: 'batch', label: 'Batch size (B, sequences)', name: 'batch size' },
];

const MACHINE_FIELDS: { field: NumericField; label: string; name: string }[] = [
  { field: 'peakTflops', label: 'Peak compute (TFLOP/s)', name: 'peak compute' },
  { field: 'bandwidthTBs', label: 'Memory bandwidth (TB/s)', name: 'memory bandwidth' },
];

interface ExplorerProps {
  state: LlmUrlState;
  estimate: PhaseEstimate;
  footprint: number;
  notes: string[];
  onChange: (patch: Partial<LlmUrlState>) => void;
}

export function boundLabel(bound: PhaseEstimate['bound']): string {
  return bound === 'memory' ? 'Bandwidth-bound' : 'Compute-bound';
}

export function Explorer({ state, estimate: e, footprint, notes, onChange }: ExplorerProps) {
  const precisionName = useId();
  const phaseName = useId();
  const field = ({ field: f, label, name }: (typeof MODEL_FIELDS)[number]) => (
    <NumberField key={f} field={f} label={label} name={name} value={state[f]} onCommit={(v) => onChange({ [f]: v })} />
  );
  const decode = e.phase === 'decode';

  return (
    <ExhibitFigure
      kind="simulation"
      id={EXPLORER_FIGURE_ID}
      title="Model and machine"
      description="Change any number; every estimate on the page recomputes at once. Values are stored in the page address."
    >
      <div className="llm-explorer">
        <div className="llm-controls">
          <fieldset className="llm-group">
            <legend>Phase</legend>
            <div className="segmented">
              {(
                [
                  ['decode', 'Decode — one new token per sequence'],
                  ['prefill', 'Prefill — the whole prompt at once'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="segmented__option">
                  <input
                    type="radio"
                    name={phaseName}
                    value={value}
                    checked={state.phase === value}
                    onChange={() => onChange({ phase: value })}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="llm-group">
            <legend>Model</legend>
            <div className="llm-presets" role="group" aria-label="Model presets">
              {MODEL_PRESETS.map((p) => (
                <button key={p.id} type="button" className="btn llm-preset" onClick={() => onChange(p.values)}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="llm-fields">{MODEL_FIELDS.map(field)}</div>
            <fieldset className="segmented llm-precision">
              <legend>Precision (b, bytes per number)</legend>
              {PRECISIONS.map((p) => (
                <label key={p.bytes} className="segmented__option">
                  <input
                    type="radio"
                    name={precisionName}
                    value={p.bytes}
                    checked={state.bytesPerParam === p.bytes}
                    onChange={() => onChange({ bytesPerParam: p.bytes })}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </fieldset>
            {notes.map((n) => (
              <p key={n} className="llm-warning">
                <span aria-hidden="true">⚠ </span>
                {n}
              </p>
            ))}
          </fieldset>

          <fieldset className="llm-group">
            <legend>Workload</legend>
            <div className="llm-fields">{WORKLOAD_FIELDS.map(field)}</div>
          </fieldset>

          <fieldset className="llm-group">
            <legend>Machine (peak, idealised)</legend>
            <div className="llm-presets" role="group" aria-label="Machine presets">
              {MACHINE_PRESETS.map((p) => (
                <button key={p.id} type="button" className="btn llm-preset" onClick={() => onChange(p.values)}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="llm-fields">{MACHINE_FIELDS.map(field)}</div>
          </fieldset>
        </div>

        <div className="llm-estimate" role="group" aria-label="Estimate for one step">
          <p className="llm-estimate__title">
            Estimate for one {decode ? 'decode' : 'prefill'} step{' '}
            <span className="hint">(upper bound on speed, not a benchmark)</span>
          </p>
          <p className={`llm-verdict llm-verdict--${e.bound}`} aria-live="polite">
            <strong>{boundLabel(e.bound)}</strong>: intensity {formatIntensity(e.intensity)}{' '}
            {e.bound === 'memory' ? 'is below' : 'reaches'} the ridge at {sig3(e.ridge)} FLOP/byte.
          </p>
          <dl className="llm-dl">
            <div>
              <dt>Raw weights = P × b</dt>
              <dd>{formatBytes(e.weightBytes)}</dd>
            </div>
            <div>
              <dt>KV cache per sequence = 2 × L × T × Hkv × dh × b</dt>
              <dd>{formatBytes(e.kvBytes)}</dd>
            </div>
            <div>
              <dt>Resident memory = weights + B × KV</dt>
              <dd>{formatBytes(footprint)}</dd>
            </div>
            <div>
              <dt>FLOPs per step (weights {formatFlops(e.matmulFlops)} + attention {formatFlops(e.attentionFlops)})</dt>
              <dd>{formatFlops(e.flops)}</dd>
            </div>
            <div>
              <dt>Bytes moved per step (weights once + {decode ? 'read' : 'write'} B × KV)</dt>
              <dd>{formatBytes(e.bytes)}</dd>
            </div>
            <div>
              <dt>Arithmetic intensity (AI) = FLOPs ÷ bytes</dt>
              <dd>{formatIntensity(e.intensity)}</dd>
            </div>
            <div>
              <dt>Attainable = min(peak compute, bandwidth × AI)</dt>
              <dd>{formatRate(e.attainableFlopsPerSecond)}</dd>
            </div>
            <div>
              <dt>
                Time ≥ max(compute {formatSeconds(e.computeSeconds)}, memory {formatSeconds(e.memorySeconds)})
              </dt>
              <dd>{formatSeconds(e.timeLowerBoundSeconds)}</dd>
            </div>
            <div className="llm-dl__headline">
              <dt>
                {decode ? 'Generation' : 'Prompt ingestion'} speed, upper bound ({e.tokensPerStep.toLocaleString('en-US')}{' '}
                {e.tokensPerStep === 1 ? 'token' : 'tokens'} per step)
              </dt>
              <dd>≤ {formatTokensPerSecond(e.tokensPerSecondUpperBound)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </ExhibitFigure>
  );
}
