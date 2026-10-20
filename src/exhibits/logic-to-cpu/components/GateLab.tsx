import { useId } from 'react';
import { ExhibitFigure } from '../../../components/ExhibitFigure';
import { evaluateGate, evaluateWithNand, gateArity, GATE_TYPES, truthTable, type Bit, type GateType } from '../sim/gates';
import { GateSymbol, gateInputY, wireClass } from './GateSymbol';

export const GATE_RULES: Record<GateType, string> = {
  AND: 'The output is 1 only when both inputs are 1.',
  OR: 'The output is 1 when at least one input is 1.',
  XOR: 'Exclusive OR: the output is 1 when the inputs differ.',
  NAND: 'NOT-AND: the output is 0 only when both inputs are 1.',
  NOR: 'NOT-OR: the output is 1 only when both inputs are 0.',
  XNOR: 'The output is 1 when the inputs are equal.',
  NOT: 'An inverter: the output is the opposite of its single input.',
};

interface GateLabProps {
  gate: GateType;
  a: Bit;
  b: Bit;
  deep: boolean;
  onChange: (patch: { gate?: GateType; ga?: Bit; gb?: Bit }) => void;
}

export function GateLab({ gate, a, b, deep, onChange }: GateLabProps) {
  const groupName = useId();
  const unary = gateArity(gate) === 1;
  const out = evaluateGate(gate, a, b);
  const nand = evaluateWithNand(gate, a, b);
  const flip = (bit: Bit): Bit => (bit ? 0 : 1);

  return (
    <ExhibitFigure
      kind="simulation"
      title="Gate lab"
      description="Choose a gate, flip its inputs and watch the output respond."
      className="gate-lab"
    >
      <fieldset className="segmented">
        <legend>Gate</legend>
        {GATE_TYPES.map((type) => (
          <label key={type} className="segmented__option">
            <input
              type="radio"
              name={groupName}
              value={type}
              checked={gate === type}
              onChange={() => onChange({ gate: type })}
            />
            <span>{type}</span>
          </label>
        ))}
      </fieldset>

      <div className="gate-lab__bench">
        <div className="gate-lab__inputs">
          <button type="button" className="bit-switch" aria-pressed={a === 1} aria-label="Input A" onClick={() => onChange({ ga: flip(a) })}>
            <span className="bit-switch__name" aria-hidden="true">A</span>
            <span className="bit-switch__value" aria-hidden="true">{a}</span>
          </button>
          <button
            type="button"
            className="bit-switch"
            aria-pressed={b === 1}
            aria-label="Input B"
            aria-describedby={unary ? `${groupName}-unary` : undefined}
            disabled={unary}
            onClick={() => onChange({ gb: flip(b) })}
          >
            <span className="bit-switch__name" aria-hidden="true">B</span>
            <span className="bit-switch__value" aria-hidden="true">{unary ? '–' : b}</span>
          </button>
          {unary && (
            <p id={`${groupName}-unary`} className="hint">
              NOT has a single input, so B is disconnected.
            </p>
          )}
        </div>

        <svg className="circuit gate-lab__diagram" viewBox="0 0 250 100" role="img" aria-label={`${gate} gate symbol, wires lit where the signal is 1`}>
          <text className="circuit__label" x={8} y={44}>
            A
          </text>
          <line className={wireClass(a)} x1={22} y1={40} x2={unary ? 45 : 60} y2={40} />
          {unary ? (
            <polyline className={wireClass(a)} points={`45,40 45,${20 + gateInputY(gate, 0)} 60,${20 + gateInputY(gate, 0)}`} />
          ) : (
            <>
              <text className="circuit__label" x={8} y={84}>
                B
              </text>
              <line className={wireClass(b)} x1={22} y1={80} x2={45} y2={80} />
              <polyline className={wireClass(b)} points={`45,80 45,60 60,60`} />
            </>
          )}
          <GateSymbol type={gate} inputs={unary ? [a] : [a, b]} output={out} x={60} y={20} />
          <line className={wireClass(out)} x1={160} y1={50} x2={196} y2={50} />
          <circle className={`lamp${out ? ' lamp--on' : ''}`} cx={212} cy={50} r={14} />
          <text className="circuit__lamp-text" x={212} y={55} textAnchor="middle">
            {out}
          </text>
        </svg>

        <p role="status" className="gate-lab__output">
          Output <span className={`bit-chip${out ? ' bit-chip--on' : ''}`}>{out}</span>
        </p>
      </div>

      <p className="gate-lab__rule">
        <strong>{gate}.</strong> {GATE_RULES[gate]}
      </p>

      <table className="truth-table">
        <caption>{gate} truth table (current inputs highlighted)</caption>
        <thead>
          <tr>
            <th scope="col">A</th>
            {!unary && <th scope="col">B</th>}
            <th scope="col">Output</th>
          </tr>
        </thead>
        <tbody>
          {truthTable(gate).map((row) => {
            const current = row.inputs[0] === a && (unary || row.inputs[1] === b);
            return (
              <tr key={row.inputs.join('')} aria-current={current ? 'true' : undefined} className={current ? 'is-current' : undefined}>
                {row.inputs.map((bit, i) => (
                  <td key={i}>{bit}</td>
                ))}
                <td className={row.output ? 'is-one' : undefined}>{row.output}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {deep && (
        <div className="deep-note">
          <h4>Rebuilt from NAND alone</h4>
          <p>
            The same {gate} can be wired from nothing but NAND gates. The lab just recomputed your inputs that way: it
            took <strong>{nand.nandCount}</strong> NAND gate{nand.nandCount === 1 ? '' : 's'} and produced{' '}
            <strong>{nand.output}</strong>, matching the direct result of {out}.
          </p>
          <p>
            Because NAND can imitate every other gate, it is called <em>functionally complete</em> (or universal). Henry
            Sheffer showed in 1913 that one such operation suffices for Boolean algebra; chip makers exploit it because a
            CMOS NAND needs only four transistors.
          </p>
        </div>
      )}
    </ExhibitFigure>
  );
}
