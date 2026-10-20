import { ExhibitFigure } from '../../../components/ExhibitFigure';
import { roofline, type Phase, type PhaseEstimate } from '../model/bottleneck';
import { formatIntensity, formatRate, formatSeconds, formatSI, sig3 } from '../model/format';
import { boundLabel } from './Explorer';

const W = 640;
const H = 380;
const M = { top: 28, right: 24, bottom: 56, left: 70 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

const PREFIX = ['', 'k', 'M', 'G', 'T', 'P', 'E'];

/** Compact decade label: 0.01, 0.1, 1, 10, 100, 1k, 10k … */
function decadeLabel(k: number, unit = ''): string {
  if (k < 0) return `${Number((10 ** k).toPrecision(1))}${unit}`;
  const group = Math.min(Math.floor(k / 3), PREFIX.length - 1);
  return `${10 ** (k - group * 3)}${unit ? ' ' : ''}${PREFIX[group]}${unit}`;
}

interface RooflineChartProps {
  peakFlopsPerSecond: number;
  bytesPerSecond: number;
  estimates: Record<Phase, PhaseEstimate>;
  active: Phase;
}

const SERIES: Record<Phase, { label: string; color: string }> = {
  decode: { label: 'Decode', color: '#b88a22' },
  prefill: { label: 'Prefill', color: '#4d97e0' },
};

export function RooflineChart({ peakFlopsPerSecond: peak, bytesPerSecond: bw, estimates, active }: RooflineChartProps) {
  const ridge = peak / bw;
  const ais = [estimates.decode.intensity, estimates.prefill.intensity, ridge];
  let x0 = Math.max(-3, Math.floor(Math.log10(Math.min(...ais) / 3)));
  let x1 = Math.min(9, Math.ceil(Math.log10(Math.max(...ais) * 3)));
  if (x1 - x0 < 4) {
    x0 = Math.max(-3, x0 - 1);
    x1 = x0 + 4;
  }
  const y1 = Math.ceil(Math.log10(peak * 2));
  let y0 = Math.floor(Math.log10(roofline(peak, bw, 10 ** x0)));
  if (y1 - y0 < 2) y0 = y1 - 2;

  const sx = (ai: number) => M.left + ((Math.log10(ai) - x0) / (x1 - x0)) * PW;
  const sy = (f: number) => M.top + (1 - (Math.log10(f) - y0) / (y1 - y0)) * PH;

  const roofPoints = [
    [10 ** x0, bw * 10 ** x0],
    [ridge, peak],
    [10 ** x1, peak],
  ]
    .filter(([ai]) => ai! >= 10 ** x0 && ai! <= 10 ** x1)
    .map(([ai, f]) => `${sx(ai!).toFixed(1)},${sy(f!).toFixed(1)}`)
    .join(' ');

  const xTicks = Array.from({ length: x1 - x0 + 1 }, (_, i) => x0 + i);
  const yTicks = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i);

  const describe = (p: Phase) => {
    const e = estimates[p];
    return `${SERIES[p].label} point at ${formatIntensity(e.intensity)}: ${boundLabel(e.bound).toLowerCase()}, attainable ${formatRate(e.attainableFlopsPerSecond)}.`;
  };
  const label =
    `Roofline chart, log–log. Bandwidth slope ${formatRate(bw)} per FLOP/byte meets the compute roof of ${formatRate(peak)} ` +
    `at the ridge, ${sig3(ridge)} FLOP/byte. ${describe('decode')} ${describe('prefill')}`;

  const ridgeX = sx(ridge);

  return (
    <ExhibitFigure
      kind="simulation"
      title="Roofline upper-bound chart"
      description="Each point is placed by the current settings. The roof is a ceiling: real kernels land on or below it."
    >
      <div className="llm-chart">
        <div className="llm-chart__scroll" tabIndex={0} role="group" aria-label="Chart area (scrolls sideways on narrow screens)">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="llm-chart__svg">
            {yTicks.map((k) => (
              <g key={`y${k}`}>
                <line className="llm-chart__grid" x1={M.left} x2={W - M.right} y1={sy(10 ** k)} y2={sy(10 ** k)} />
                <text className="llm-chart__tick" x={M.left - 8} y={sy(10 ** k)} textAnchor="end" dominantBaseline="middle">
                  {decadeLabel(k)}
                </text>
              </g>
            ))}
            {xTicks.map((k) => (
              <g key={`x${k}`}>
                <line className="llm-chart__grid" x1={sx(10 ** k)} x2={sx(10 ** k)} y1={M.top} y2={M.top + PH} />
                <text className="llm-chart__tick" x={sx(10 ** k)} y={M.top + PH + 18} textAnchor="middle">
                  {decadeLabel(k)}
                </text>
              </g>
            ))}
            <text className="llm-chart__axis" x={M.left + PW / 2} y={H - 10} textAnchor="middle">
              Arithmetic intensity (FLOP per byte, log scale)
            </text>
            <text
              className="llm-chart__axis"
              transform={`translate(16 ${M.top + PH / 2}) rotate(-90)`}
              textAnchor="middle"
            >
              Attainable FLOP/s (log scale)
            </text>

            <rect className="llm-chart__zone" x={M.left} y={M.top} width={Math.max(0, ridgeX - M.left)} height={PH} />
            <text className="llm-chart__zone-label" x={M.left + 8} y={M.top + 16}>
              bandwidth-bound
            </text>
            <text className="llm-chart__zone-label" x={W - M.right - 8} y={M.top + PH - 10} textAnchor="end">
              compute-bound
            </text>

            <line className="llm-chart__ridge" x1={ridgeX} x2={ridgeX} y1={sy(peak)} y2={M.top + PH} />
            <text className="llm-chart__ridge-label" x={ridgeX + 6} y={M.top + PH - 28}>
              ridge {sig3(ridge)} FLOP/byte
            </text>
            <polyline className="llm-chart__roof" points={roofPoints} />

            {(['decode', 'prefill'] as const).map((p) => {
              const e = estimates[p];
              const cx = sx(e.intensity);
              const cy = sy(e.attainableFlopsPerSecond);
              const r = p === active ? 8 : 6;
              const above = p === 'decode';
              const anchor = cx > W - M.right - 140 ? 'end' : 'start';
              const dx = anchor === 'end' ? -12 : 12;
              return (
                <g key={p} className={`llm-chart__point${p === active ? ' is-active' : ''}`}>
                  <title>{describe(p)}</title>
                  <circle className="llm-chart__hit" cx={cx} cy={cy} r={18} />
                  {p === 'decode' ? (
                    <circle cx={cx} cy={cy} r={r} fill={SERIES[p].color} className="llm-chart__mark" />
                  ) : (
                    <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} rx={2} fill={SERIES[p].color} className="llm-chart__mark" />
                  )}
                  <text className="llm-chart__label" x={cx + dx} y={cy + (above ? -14 : 24)} textAnchor={anchor}>
                    {SERIES[p].label}
                    {p === active ? ' (selected)' : ''} · {formatIntensity(e.intensity)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <ul className="llm-legend" aria-hidden="true">
          <li>
            <span className="llm-legend__mark llm-legend__mark--decode" /> Decode (circle)
          </li>
          <li>
            <span className="llm-legend__mark llm-legend__mark--prefill" /> Prefill (square)
          </li>
          <li>
            <span className="llm-legend__mark llm-legend__mark--roof" /> Roof = min(peak compute, bandwidth × AI): flat at{' '}
            {formatRate(peak)}, slope {formatSI(bw, 'B/s')}
          </li>
        </ul>
        <div className="table-scroll">
          <table className="llm-table">
            <caption>Roofline data for the current settings</caption>
            <thead>
              <tr>
                <th scope="col">Phase</th>
                <th scope="col">Intensity</th>
                <th scope="col">Attainable (≤)</th>
                <th scope="col">Bound</th>
                <th scope="col">Time per step (≥)</th>
              </tr>
            </thead>
            <tbody>
              {(['decode', 'prefill'] as const).map((p) => {
                const e = estimates[p];
                return (
                  <tr key={p} aria-current={p === active ? 'true' : undefined}>
                    <th scope="row">{SERIES[p].label}</th>
                    <td>{formatIntensity(e.intensity)}</td>
                    <td>{formatRate(e.attainableFlopsPerSecond)}</td>
                    <td>{boundLabel(e.bound)}</td>
                    <td>{formatSeconds(e.timeLowerBoundSeconds)}</td>
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
