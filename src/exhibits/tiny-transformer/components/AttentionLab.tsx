import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useMotion } from '../../../lib/motion';
import { fixed, fmt, fmtVector, term } from '../format';
import { DEFAULT_K, DEFAULT_Q, DEFAULT_V, attention, type AttentionResult, type Matrix } from '../math';
import {
  ENTRY_MAX,
  ENTRY_MIN,
  LAST_STAGE,
  STAGES,
  TOKENS,
  parseEntry,
  roundEntry,
  withEntry,
  type TinyTransformerState,
} from '../urlConfig';

export const LAB_FIGURE_ID = 'attention-lab';
const STAGE_MS = 1800;
const ENTRY_STEP = 0.5;

/** Stage headlines read by the live region. Kept free of the figure-kind words on purpose. */
const STAGE_SUMMARY: readonly string[] = [
  'Each token has a query (what it is looking for), a key (what it offers) and a value (what it passes on).',
  'Every query is dotted with every key: multiply matching components and add them up.',
  'Every raw score is divided by √dk so that wider vectors do not produce ever-larger scores.',
  'Softmax turns each row of scaled scores into positive weights that add up to 1.',
  'Each output row is the weighted sum of the value rows, using that query’s weights.',
];

// ── Editable matrices ──────────────────────────────────────────────────

interface EntryInputProps {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  onValidity: (message: string | null) => void;
}

/**
 * A text field for one matrix entry. While a visitor types an incomplete or invalid value
 * ("", "-", "12") the computation keeps using the last valid number; on blur the field
 * snaps back to it. ↑/↓ nudge the value by 0.5.
 */
function EntryInput({ label, value, onCommit, onValidity }: EntryInputProps) {
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  // Follow outside changes (reset, a pasted link) unless the draft already means the same number.
  if (value !== shown) {
    setShown(value);
    if (parseEntry(text) !== value) setText(String(value));
  }
  const invalid = parseEntry(text) === undefined;

  const change = (next: string) => {
    setText(next);
    const parsed = parseEntry(next);
    if (parsed === undefined) {
      onValidity(`${label} needs a number from −10 to 10. The computation is still using ${fmt(value, 4)}.`);
      return;
    }
    onValidity(null);
    if (parsed !== value) onCommit(parsed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const delta = event.key === 'ArrowUp' ? ENTRY_STEP : -ENTRY_STEP;
    change(String(roundEntry(Math.min(ENTRY_MAX, Math.max(ENTRY_MIN, value + delta)))));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      className="tt-entry"
      aria-label={label}
      aria-invalid={invalid || undefined}
      value={text}
      onChange={(e) => change(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => {
        if (invalid) {
          setText(String(value));
          onValidity(null);
        }
      }}
    />
  );
}

interface MatrixEditorProps {
  /** "Query", "Key" or "Value" — used in every field's label. */
  noun: string;
  symbol: string;
  rowSymbol: string;
  caption: ReactNode;
  matrix: Matrix;
  active: boolean;
  focusRow?: number;
  onChange: (matrix: Matrix) => void;
}

function MatrixEditor({ noun, symbol, rowSymbol, caption, matrix, active, focusRow, onChange }: MatrixEditorProps) {
  const captionId = useId();
  const [error, setError] = useState<string | null>(null);
  const cols = matrix[0]!.length;
  return (
    <div className="tt-editor" data-active={active || undefined}>
      <div className="table-scroll">
        <table className="tt-matrix" aria-labelledby={captionId}>
          <caption id={captionId}>
            <span className="tt-symbol">{symbol}</span> {caption}
          </caption>
          <thead>
            <tr>
              <td />
              {Array.from({ length: cols }, (_, j) => (
                <th key={j} scope="col">
                  <span className="visually-hidden">component </span>
                  {j + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={i} data-focus={i === focusRow || undefined}>
                <th scope="row" className="mono">
                  {rowSymbol}
                  <sub>{i + 1}</sub>
                </th>
                {row.map((x, j) => (
                  <td key={j}>
                    <EntryInput
                      label={`${noun} ${i + 1}, component ${j + 1}`}
                      value={x}
                      onCommit={(n) => onChange(withEntry(matrix, i, j, n))}
                      onValidity={setError}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tt-editor__error" aria-live="polite">
        {error}
      </p>
    </div>
  );
}

// ── Computed intermediates ─────────────────────────────────────────────

interface ResultTableProps {
  caption: ReactNode;
  matrix: readonly (readonly number[])[];
  rowSymbol: string;
  colHeads: readonly ReactNode[];
  digits?: number;
  focusRow: number;
  extra?: { head: string; cell: (row: readonly number[]) => string };
}

function ResultTable({ caption, matrix, rowSymbol, colHeads, digits = 3, focusRow, extra }: ResultTableProps) {
  const captionId = useId();
  return (
    <div className="table-scroll">
      <table className="tt-result" aria-labelledby={captionId}>
        <caption id={captionId}>{caption}</caption>
        <thead>
          <tr>
            <td />
            {colHeads.map((h, j) => (
              <th key={j} scope="col" className="mono">
                {h}
              </th>
            ))}
            {extra && (
              <th scope="col" className="tt-result__extra">
                {extra.head}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i} data-focus={i === focusRow || undefined}>
              <th scope="row" className="mono">
                {rowSymbol}
                <sub>{i + 1}</sub>
              </th>
              {row.map((x, j) => (
                <td key={j} className="mono">
                  {digits === 3 ? fixed(x) : fmt(x, digits)}
                </td>
              ))}
              {extra && <td className="mono tt-result__extra">{extra.cell(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WeightBars({ weights, row }: { weights: readonly number[]; row: number }) {
  return (
    <div className="tt-bars" aria-hidden="true">
      <span className="tt-bars__title">
        q<sub>{row + 1}</sub> weights
      </span>
      {weights.map((w, j) => (
        <span key={j} className="tt-bars__row">
          <span className="tt-bars__label mono">
            k<sub>{j + 1}</sub>
          </span>
          <span className="tt-bars__track">
            <span className="tt-bars__fill" style={{ width: `${(w * 100).toFixed(1)}%` }} />
          </span>
          <span className="tt-bars__value mono">{fixed(w)}</span>
        </span>
      ))}
    </div>
  );
}

// ── Step-by-step arithmetic for one query row ──────────────────────────

function StageArithmetic({
  stage,
  row,
  Q,
  K,
  V,
  r,
  deep,
}: {
  stage: number;
  row: number;
  Q: Matrix;
  K: Matrix;
  V: Matrix;
  r: AttentionResult;
  deep: boolean;
}) {
  const n = row + 1;
  const q = Q[row]!;
  const scaled = r.scaledScores[row]!;
  const max = Math.max(...scaled);
  const exps = scaled.map((s) => Math.exp(s - max));
  const total = exps.reduce((a, b) => a + b, 0);
  const weights = r.weights[row]!;
  const out = r.output[row]!;

  switch (stage) {
    case 0:
      return (
        <ul className="tt-working">
          <li>
            q<sub>{n}</sub> = <span className="mono">{fmtVector(q)}</span> — what token {n} is looking for.
          </li>
          {K.map((k, j) => (
            <li key={j}>
              k<sub>{j + 1}</sub> = <span className="mono">{fmtVector(k)}</span>, v<sub>{j + 1}</sub> ={' '}
              <span className="mono">{fmtVector(V[j]!)}</span>
            </li>
          ))}
          <li>
            Each query and key has d<sub>k</sub> = {r.dk} components; each value has d<sub>v</sub> = {r.dv}.
          </li>
        </ul>
      );
    case 1:
      return (
        <ul className="tt-working">
          {K.map((k, j) => (
            <li key={j} className="mono">
              q<sub>{n}</sub>·k<sub>{j + 1}</sub> = {q.map((x, c) => `${term(x)}×${term(k[c]!)}`).join(' + ')} ={' '}
              <strong>{fmt(r.scores[row]![j]!)}</strong>
            </li>
          ))}
        </ul>
      );
    case 2:
      return (
        <ul className="tt-working">
          <li>
            √d<sub>k</sub> = √{r.dk} = {fmt(r.scale, 4)}
          </li>
          {scaled.map((s, j) => (
            <li key={j} className="mono">
              {term(r.scores[row]![j]!)} ÷ {fmt(r.scale, 4)} = <strong>{fmt(s)}</strong>
            </li>
          ))}
          {deep && (
            <li>
              If query and key components were independent with mean 0 and variance 1, a raw score would have variance
              d<sub>k</sub>. Dividing by √d<sub>k</sub> brings it back to variance 1, so softmax is not pushed into
              near-one-hot outputs with vanishing gradients.
            </li>
          )}
        </ul>
      );
    case 3:
      return (
        <ul className="tt-working">
          <li>
            Largest scaled score: {fmt(max)}. Subtracting it first keeps every exponent ≤ 0, so nothing overflows; the
            result is unchanged.
          </li>
          {scaled.map((s, j) => (
            <li key={j} className="mono">
              e<sup>{`${term(s)} − ${term(max)}`}</sup> = {fixed(exps[j]!, 4)}
            </li>
          ))}
          <li className="mono">sum = {fixed(total, 4)}</li>
          {weights.map((w, j) => (
            <li key={j} className="mono">
              w<sub>{j + 1}</sub> = {fixed(exps[j]!, 4)} ÷ {fixed(total, 4)} = <strong>{fixed(w)}</strong>
            </li>
          ))}
          {deep && <li>Softmax is a soft version of “pick the biggest”: every key keeps some weight, none is negative.</li>}
        </ul>
      );
    default:
      return (
        <ul className="tt-working">
          {out.map((o, c) => (
            <li key={c} className="mono">
              output<sub>{n}</sub>[{c + 1}] = {weights.map((w, j) => `${fixed(w)}×${term(V[j]![c]!)}`).join(' + ')} ={' '}
              <strong>{fixed(o)}</strong>
            </li>
          ))}
          <li>
            The output for token {n} is <span className="mono">{fmtVector(out)}</span>: mostly v
            <sub>{weights.indexOf(Math.max(...weights)) + 1}</sub>, because that key matched q<sub>{n}</sub> best.
          </li>
        </ul>
      );
  }
}

// ── The figure ─────────────────────────────────────────────────────────

interface AttentionLabProps {
  state: TinyTransformerState;
  update: (patch: Partial<TinyTransformerState>) => void;
  deep: boolean;
}

export function AttentionLab({ state, update, deep }: AttentionLabProps) {
  const { reducedMotion } = useMotion();
  const uid = useId();
  const { q: Q, k: K, v: V, stage, row } = state;
  const r = attention(Q, K, V);

  const [playing, setPlaying] = useState(false);
  const isPlaying = playing && !reducedMotion;

  useEffect(() => {
    if (!isPlaying) return;
    if (stage >= LAST_STAGE) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => update({ stage: stage + 1 }), STAGE_MS);
    return () => window.clearTimeout(id);
  }, [isPlaying, stage, update]);

  const goTo = (s: number) => {
    setPlaying(false);
    update({ stage: Math.min(Math.max(s, 0), LAST_STAGE) });
  };
  const togglePlay = () => {
    if (isPlaying) {
      setPlaying(false);
      return;
    }
    if (stage >= LAST_STAGE) update({ stage: 0 });
    setPlaying(true);
  };
  const replay = () => {
    update({ stage: 0 });
    setPlaying(!reducedMotion);
  };
  const isDefault = [
    [Q, DEFAULT_Q],
    [K, DEFAULT_K],
    [V, DEFAULT_V],
  ].every(([a, b]) => JSON.stringify(a) === JSON.stringify(b));

  const weights = r.weights[row]!;
  const best = weights.indexOf(Math.max(...weights));
  const keyHeads = K.map((_, j) => (
    <>
      k<sub>{j + 1}</sub>
    </>
  ));
  const dimHeads = Array.from({ length: r.dv }, (_, c) => `${c + 1}`);
  const block = (s: number) => ({ 'data-active': s === stage || undefined, 'data-done': s < stage || undefined });

  return (
    <figure
      id={LAB_FIGURE_ID}
      tabIndex={-1}
      className="exhibit-figure tt-figure tt-figure--sim"
      aria-labelledby={`${uid}-kind ${uid}-title`}
    >
      <figcaption className="exhibit-figure__caption">
        <span id={`${uid}-kind`} className="kind-badge kind-badge--simulation">
          <span className="kind-badge__icon" aria-hidden="true">
            ●
          </span>
          Simulation (real computation)
        </span>
        <span className="exhibit-figure__title" id={`${uid}-title`}>
          Scaled dot-product attention on three tokens
        </span>
        <span className="exhibit-figure__description">
          Every number below is computed in your browser from the Q, K and V you enter, with 64-bit floating point.
        </span>
      </figcaption>

      <div className="exhibit-figure__body">
        <div className="tt-inputs" {...block(0)}>
          <MatrixEditor
            noun="Query"
            symbol="Q"
            rowSymbol="q"
            caption={`queries — what each token looks for (${TOKENS} × ${r.dk})`}
            matrix={Q}
            active={stage === 0}
            focusRow={row}
            onChange={(q) => update({ q })}
          />
          <MatrixEditor
            noun="Key"
            symbol="K"
            rowSymbol="k"
            caption={`keys — what each token offers (${TOKENS} × ${r.dk})`}
            matrix={K}
            active={stage === 0}
            onChange={(k) => update({ k })}
          />
          <MatrixEditor
            noun="Value"
            symbol="V"
            rowSymbol="v"
            caption={`values — what each token passes on (${TOKENS} × ${r.dv})`}
            matrix={V}
            active={stage === 0}
            onChange={(v) => update({ v })}
          />
        </div>
        <div className="tt-toolbar">
          <p className="hint">
            Type numbers from −10 to 10 (↑/↓ nudge by 0.5). Every intermediate updates instantly.
          </p>
          <button
            type="button"
            className="btn"
            disabled={isDefault}
            onClick={() => update({ q: DEFAULT_Q, k: DEFAULT_K, v: DEFAULT_V })}
          >
            Restore the example numbers
          </button>
        </div>

        <div className="tt-walk">
          <div className="button-row" role="group" aria-label="Walkthrough controls">
            <button type="button" className="btn btn--primary" onClick={() => goTo(stage + 1)} disabled={stage >= LAST_STAGE}>
              Step<span aria-hidden="true"> →</span>
            </button>
            <button
              type="button"
              className="btn"
              onClick={togglePlay}
              disabled={reducedMotion}
              aria-describedby={reducedMotion ? `${uid}-motion` : undefined}
            >
              {isPlaying ? 'Pause walkthrough' : 'Play walkthrough'}
            </button>
            <button type="button" className="btn" onClick={() => goTo(0)}>
              Reset
            </button>
            <button type="button" className="btn" onClick={replay}>
              Replay
            </button>
          </div>
          {reducedMotion && (
            <p className="hint" id={`${uid}-motion`}>
              Automatic play is off because reduced motion is on. Use Step to move through the stages.
            </p>
          )}
          <ol className="tt-stages">
            {STAGES.map((s, i) => (
              <li key={s.id} aria-current={i === stage ? 'step' : undefined} data-done={i < stage || undefined}>
                <button type="button" className="tt-stages__btn" onClick={() => goTo(i)}>
                  <span className="tt-stages__num" aria-hidden="true">
                    {i + 1}
                  </span>
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
          <p className="tt-status" role="status">
            Stage {stage + 1} of {STAGES.length}: {STAGES[stage]!.label}. {STAGE_SUMMARY[stage]}
          </p>
        </div>

        <div className="tt-results">
          <div className="tt-block" {...block(1)}>
            <ResultTable
              caption={
                <>
                  Raw scores S = Q·K<sup>ᵀ</sup>
                </>
              }
              matrix={r.scores}
              rowSymbol="q"
              colHeads={keyHeads}
              digits={4}
              focusRow={row}
            />
          </div>
          <div className="tt-block" {...block(2)}>
            <ResultTable
              caption={`Scaled scores S ÷ √${r.dk} (÷ ${fmt(r.scale, 4)})`}
              matrix={r.scaledScores}
              rowSymbol="q"
              colHeads={keyHeads}
              focusRow={row}
            />
          </div>
          <div className="tt-block" {...block(3)}>
            <ResultTable
              caption="Softmax weights (each row sums to 1)"
              matrix={r.weights}
              rowSymbol="q"
              colHeads={keyHeads}
              focusRow={row}
              extra={{ head: 'Sum', cell: (w) => fixed(w.reduce((a, b) => a + b, 0)) }}
            />
            <WeightBars weights={weights} row={row} />
          </div>
          <div className="tt-block" {...block(4)}>
            <ResultTable
              caption="Output: weighted sum of V"
              matrix={r.output}
              rowSymbol="out"
              colHeads={dimHeads}
              focusRow={row}
            />
          </div>
        </div>

        <section className="tt-arith" aria-labelledby={`${uid}-arith`}>
          <div className="tt-arith__head">
            <h3 id={`${uid}-arith`}>
              Stage {stage + 1} by hand: {STAGES[stage]!.label}
            </h3>
            <div className="field">
              <label htmlFor={`${uid}-row`}>Show the arithmetic for</label>
              <select id={`${uid}-row`} value={row} onChange={(e) => update({ row: Number(e.target.value) })}>
                {Q.map((_, i) => (
                  <option key={i} value={i}>
                    token {i + 1} (q{i + 1})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <StageArithmetic stage={stage} row={row} Q={Q} K={K} V={V} r={r} deep={deep} />
          <p className="tt-summary" aria-live="polite">
            Token {row + 1} attends most to token {best + 1} (weight {fixed(weights[best]!)}), so its output is{' '}
            <span className="mono">{fmtVector(r.output[row]!)}</span>.
          </p>
        </section>
      </div>
    </figure>
  );
}
