import { ExhibitFigure } from '../../../components/ExhibitFigure';
import { estimatePhase, type LlmConfig, type PhaseEstimate } from '../model/bottleneck';
import { formatBytes, formatIntensity, formatSeconds, formatTokensPerSecond } from '../model/format';
import { boundLabel } from './Explorer';

const SWEEP_BATCHES = [1, 4, 16, 64, 256, 1024] as const;

function pct(part: number, whole: number): string {
  return `${whole > 0 ? (100 * part) / whole : 0}%`;
}

interface StepBudgetProps {
  config: LlmConfig;
  estimate: PhaseEstimate;
}

/** Where one step's bytes come from, how long each resource needs, and how batching moves the bound. */
export function StepBudget({ config, estimate: e }: StepBudgetProps) {
  const kvTotal = config.batch * e.kvBytes;
  const slower = Math.max(e.computeSeconds, e.memorySeconds);
  return (
    <ExhibitFigure
      kind="simulation"
      title="Bytes and seconds per step"
      description="Bars are to scale within each row. The longer time bar is the bottleneck; the other resource idles (or overlaps) meanwhile."
    >
      <div className="llm-budget">
        <p className="llm-budget__label">
          Bytes moved: weights {formatBytes(e.weightBytes)} + KV cache {formatBytes(kvTotal)} ({config.batch} ×{' '}
          {formatBytes(e.kvBytes)}) = {formatBytes(e.bytes)}
        </p>
        <div className="llm-bar" aria-hidden="true">
          <span className="llm-bar__seg llm-bar__seg--weights" style={{ width: pct(e.weightBytes, e.bytes) }}>
            weights
          </span>
          <span className="llm-bar__seg llm-bar__seg--kv" style={{ width: pct(kvTotal, e.bytes) }}>
            KV
          </span>
        </div>

        <p className="llm-budget__label">Time each resource needs at its peak</p>
        <div className="llm-timebars" aria-hidden="true">
          <span>Compute</span>
          <div className="llm-bar llm-bar--thin">
            <span
              className={`llm-bar__seg llm-bar__seg--time${e.bound === 'compute' ? ' is-bottleneck' : ''}`}
              style={{ width: pct(e.computeSeconds, slower) }}
            />
          </div>
          <span className="mono">{formatSeconds(e.computeSeconds)}</span>
          <span>Memory</span>
          <div className="llm-bar llm-bar--thin">
            <span
              className={`llm-bar__seg llm-bar__seg--time${e.bound === 'memory' ? ' is-bottleneck' : ''}`}
              style={{ width: pct(e.memorySeconds, slower) }}
            />
          </div>
          <span className="mono">{formatSeconds(e.memorySeconds)}</span>
        </div>
        <p className="hint">
          Compute needs {formatSeconds(e.computeSeconds)} and memory needs {formatSeconds(e.memorySeconds)}, so the step
          takes at least {formatSeconds(e.timeLowerBoundSeconds)}: {boundLabel(e.bound).toLowerCase()}.
        </p>

        <div className="table-scroll">
          <table className="llm-table">
            <caption>Decode at other batch sizes (everything else as set above)</caption>
            <thead>
              <tr>
                <th scope="col">Batch B</th>
                <th scope="col">Intensity</th>
                <th scope="col">Bound</th>
                <th scope="col">Resident memory</th>
                <th scope="col">Generation (≤)</th>
              </tr>
            </thead>
            <tbody>
              {SWEEP_BATCHES.map((batch) => {
                const s = estimatePhase({ ...config, batch }, 'decode');
                return (
                  <tr key={batch} aria-current={batch === config.batch ? 'true' : undefined}>
                    <th scope="row">{batch}</th>
                    <td>{formatIntensity(s.intensity)}</td>
                    <td>{boundLabel(s.bound)}</td>
                    <td>{formatBytes(s.weightBytes + batch * s.kvBytes)}</td>
                    <td>{formatTokensPerSecond(s.tokensPerSecondUpperBound)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </ExhibitFigure>
  );
}
