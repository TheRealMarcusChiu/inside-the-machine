import { useState } from 'react';
import { ExhibitFigure } from '../../../components/ExhibitFigure';
import { useSimulationClient } from '../../../worker/useSimulationClient';
import { add4, toSigned } from '../sim/adder';
import type { Bit } from '../sim/gates';

export const ADDER_FIGURE_ID = 'adder-lab';

const COLUMNS = [3, 2, 1, 0] as const; // most significant bit on the left, as numbers are written

interface AdderLabProps {
  a: number;
  b: number;
  cin: Bit;
  deep: boolean;
  onChange: (patch: { a?: number; b?: number; cin?: Bit }) => void;
}

export function describeAddition(a: number, b: number, cin: Bit): string {
  const r = add4(a, b, cin);
  const total = a + b + cin;
  const sum = `${a} + ${b}${cin ? ' + 1' : ''} = ${total}`;
  if (total <= 15) return sum;
  return `${sum} — too big for 4 bits, so the sum wraps to ${r.sum} and the carry-out lights up (worth 16)`;
}

function VerifyAdder() {
  const client = useSimulationClient();
  const [result, setResult] = useState<string>('');
  const verify = () => {
    if (!client.current) return;
    setResult('Checking…');
    client.current
      .run('adder.verify', { width: 4 })
      .then((r) => setResult(`Checked ${r.cases} combinations of A, B and carry-in: ${r.mismatches} mismatches with ordinary arithmetic.`))
      .catch((err: Error) => {
        if (!/disposed/i.test(err.message)) setResult(`The check could not run: ${err.message}`);
      });
  };
  return (
    <div className="verify">
      <button type="button" className="btn" onClick={verify}>
        Verify every input combination
      </button>
      <p className="hint" aria-live="polite">
        {result || 'Runs all 16 × 16 × 2 = 512 cases through the gate-level adder, off the main thread.'}
      </p>
    </div>
  );
}

export function AdderLab({ a, b, cin, deep, onChange }: AdderLabProps) {
  const r = add4(a, b, cin);
  const toggle = (value: number, bit: number) => value ^ (1 << bit);

  return (
    <ExhibitFigure
      kind="simulation"
      title="4-bit adder"
      id={ADDER_FIGURE_ID}
      description="Four full adders in a row. Each one's carry-out feeds the next one's carry-in."
      className="adder-lab"
    >
      <div className="adder-grid" role="group" aria-label="Adder inputs and outputs, most significant bit first">
        <span className="adder-grid__label">Carries</span>
        <span className="adder-grid__cell adder-grid__cell--muted" aria-hidden="true" />
        {COLUMNS.map((i) =>
          i === 0 ? (
            <button
              key={i}
              type="button"
              className="bit-switch bit-switch--small"
              aria-pressed={cin === 1}
              aria-label="Carry in"
              onClick={() => onChange({ cin: cin ? 0 : 1 })}
            >
              <span aria-hidden="true">{cin}</span>
            </button>
          ) : (
            <span key={i} className={`adder-grid__carry${r.carries[i] ? ' is-on' : ''}`} title={`Carry into bit ${i}`}>
              {r.carries[i]}
            </span>
          ),
        )}
        <span className="adder-grid__value adder-grid__value--muted">carry in {cin}</span>

        <span className="adder-grid__label">A</span>
        <span className="adder-grid__cell" aria-hidden="true" />
        {COLUMNS.map((i) => (
          <button
            key={i}
            type="button"
            className="bit-switch"
            aria-pressed={r.aBits[i] === 1}
            aria-label={`A bit ${i} (worth ${2 ** i})`}
            onClick={() => onChange({ a: toggle(a, i) })}
          >
            <span aria-hidden="true">{r.aBits[i]}</span>
          </button>
        ))}
        <span className="adder-grid__value">= {a}</span>

        <span className="adder-grid__label">B</span>
        <span className="adder-grid__cell adder-grid__plus" aria-hidden="true">
          +
        </span>
        {COLUMNS.map((i) => (
          <button
            key={i}
            type="button"
            className="bit-switch"
            aria-pressed={r.bBits[i] === 1}
            aria-label={`B bit ${i} (worth ${2 ** i})`}
            onClick={() => onChange({ b: toggle(b, i) })}
          >
            <span aria-hidden="true">{r.bBits[i]}</span>
          </button>
        ))}
        <span className="adder-grid__value">= {b}</span>

        <span className="adder-grid__label">Sum</span>
        <span
          className={`adder-grid__out adder-grid__out--carry${r.carryOut ? ' is-on' : ''}`}
          data-testid="adder-carry-out"
          title="Carry out (worth 16)"
        >
          {r.carryOut}
        </span>
        {COLUMNS.map((i) => (
          <span key={i} className={`adder-grid__out${r.sumBits[i] ? ' is-on' : ''}`}>
            {r.sumBits[i]}
          </span>
        ))}
        <span className="adder-grid__value">= {r.sum}</span>
      </div>

      <ol className="adder-chain" aria-label="Full adder stages, carry rippling right to left">
        {COLUMNS.map((i) => (
          <li key={i} className="adder-chain__stage">
            <span className="adder-chain__name">FA{i}</span>
            <span className="adder-chain__io">
              {r.aBits[i]} + {r.bBits[i]} + {r.carries[i]} → sum {r.sumBits[i]}, carry {r.carries[i + 1]}
            </span>
            <span className="adder-chain__time">settles by {Math.max(r.delays.sum[i]!, r.delays.carry[i + 1]!)} gate delays</span>
            <span className={`adder-chain__arrow${r.carries[i + 1] ? ' is-on' : ''}`} aria-hidden="true">
              ←
            </span>
          </li>
        ))}
      </ol>

      <p className="adder-lab__result" data-testid="adder-result" aria-live="polite">
        {describeAddition(a, b, cin)}
      </p>
      <p className="hint">
        Worst-case settle time for this adder: {r.delays.critical} gate delays, set by the carry rippling through all
        four stages.
      </p>

      {deep && (
        <div className="deep-note">
          <h4>The same bits, read as signed numbers</h4>
          <p>
            In two’s complement the top bit is worth −8 instead of +8, so these patterns also mean{' '}
            <strong>
              {toSigned(a, 4)} + {toSigned(b, 4)}
              {cin ? ' + 1' : ''} → {toSigned(r.sum, 4)}
            </strong>
            .{' '}
            {r.overflow
              ? 'That is signed overflow: the carry into the top bit differs from the carry out, so the signed answer is wrong even though the gates did nothing unusual.'
              : 'No signed overflow: the carry into the top bit equals the carry out.'}{' '}
            Carry-out flags unsigned overflow; the overflow test flags signed overflow. The hardware is identical — only
            the reading changes.
          </p>
          <VerifyAdder />
        </div>
      )}
    </ExhibitFigure>
  );
}
