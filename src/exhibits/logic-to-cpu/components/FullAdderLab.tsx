import { useId, useState } from 'react';
import { ExhibitFigure } from '../../../components/ExhibitFigure';
import { fullAdder } from '../sim/adder';
import type { Bit } from '../sim/gates';
import { GateSymbol, wireClass } from './GateSymbol';

const S = 0.6; // gate scale: each gate is 60 × 36 in this drawing

/** Port positions for a gate placed at (x, y) at scale S. */
const port = (x: number, y: number) => ({ in1: [x, y + 20 * S], in2: [x, y + 40 * S], out: [x + 100 * S, y + 30 * S] }) as const;

const XOR1 = port(140, 40);
const AND1 = port(140, 120);
const XOR2 = port(330, 30);
const AND2 = port(330, 170);
const OR1 = port(450, 140);

const pts = (...points: readonly (readonly number[])[]) => points.map((p) => p.join(',')).join(' ');

export function FullAdderLab() {
  const wiresId = useId();
  const [a, setA] = useState<Bit>(1);
  const [b, setB] = useState<Bit>(1);
  const [cin, setCin] = useState<Bit>(0);
  const r = fullAdder(a, b, cin);
  const { aXorB, aAndB, cinAndAXorB } = r.signals;

  const inputs: [string, Bit, (v: Bit) => void][] = [
    ['A', a, setA],
    ['B', b, setB],
    ['Carry in', cin, setCin],
  ];

  return (
    <ExhibitFigure
      kind="simulation"
      title="Full adder, gate by gate"
      description="Five gates add three bits. Every wire shows its live value."
    >
      <div className="switch-row" role="group" aria-label="Full adder inputs">
        {inputs.map(([name, value, set]) => (
          <button
            key={name}
            type="button"
            className="bit-switch"
            aria-pressed={value === 1}
            aria-label={`Full adder ${name.toLowerCase()}`}
            onClick={() => set(value ? 0 : 1)}
          >
            <span className="bit-switch__name" aria-hidden="true">{name}</span>
            <span className="bit-switch__value" aria-hidden="true">{value}</span>
          </button>
        ))}
      </div>

      <svg className="circuit full-adder__diagram" viewBox="0 0 600 240" role="img" aria-labelledby={wiresId}>
        {/* Inputs */}
        <text className="circuit__label" x={10} y={56}>A = {a}</text>
        <text className="circuit__label" x={10} y={96}>B = {b}</text>
        <text className="circuit__label" x={10} y={224}>Cin = {cin}</text>

        <polyline className={wireClass(a)} points={pts([80, 52], XOR1.in1)} />
        <polyline className={wireClass(a)} points={pts([100, 52], [100, AND1.in1[1]], AND1.in1)} />
        <circle className={`junction ${wireClass(a)}`} cx={100} cy={52} r={3.5} />

        <polyline className={wireClass(b)} points={pts([80, 92], [120, 92], [120, XOR1.in2[1]], XOR1.in2)} />
        <polyline className={wireClass(b)} points={pts([120, 92], [120, AND1.in2[1]], AND1.in2)} />
        <circle className={`junction ${wireClass(b)}`} cx={120} cy={92} r={3.5} />

        <polyline className={wireClass(cin)} points={pts([80, 220], [300, 220], [300, XOR2.in2[1]], XOR2.in2)} />
        <polyline className={wireClass(cin)} points={pts([300, AND2.in2[1]], AND2.in2)} />
        <circle className={`junction ${wireClass(cin)}`} cx={300} cy={AND2.in2[1]} r={3.5} />

        {/* Internal wires */}
        <polyline className={wireClass(aXorB)} points={pts(XOR1.out, [270, XOR1.out[1]], [270, XOR2.in1[1]], XOR2.in1)} />
        <polyline className={wireClass(aXorB)} points={pts([270, XOR1.out[1]], [270, AND2.in1[1]], AND2.in1)} />
        <circle className={`junction ${wireClass(aXorB)}`} cx={270} cy={XOR1.out[1]} r={3.5} />
        <text className="circuit__wire-label" x={206} y={XOR1.out[1] - 6}>A⊕B={aXorB}</text>

        <polyline className={wireClass(aAndB)} points={pts(AND1.out, [430, AND1.out[1]], [430, OR1.in1[1]], OR1.in1)} />
        <text className="circuit__wire-label" x={206} y={AND1.out[1] - 6}>A·B={aAndB}</text>

        <polyline className={wireClass(cinAndAXorB)} points={pts(AND2.out, [440, AND2.out[1]], [440, OR1.in2[1]], OR1.in2)} />
        <text className="circuit__wire-label" x={396} y={AND2.out[1] + 16}>Cin·(A⊕B)={cinAndAXorB}</text>

        {/* Gates */}
        <GateSymbol type="XOR" inputs={[a, b]} output={aXorB} x={140} y={40} scale={S} />
        <GateSymbol type="AND" inputs={[a, b]} output={aAndB} x={140} y={120} scale={S} />
        <GateSymbol type="XOR" inputs={[aXorB, cin]} output={r.sum} x={330} y={30} scale={S} />
        <GateSymbol type="AND" inputs={[aXorB, cin]} output={cinAndAXorB} x={330} y={170} scale={S} />
        <GateSymbol type="OR" inputs={[aAndB, cinAndAXorB]} output={r.carryOut} x={450} y={140} scale={S} />

        {/* Outputs */}
        <polyline className={wireClass(r.sum)} points={pts(XOR2.out, [540, XOR2.out[1]])} />
        <text className="circuit__label" x={512} y={XOR2.out[1] - 10}>Sum = {r.sum}</text>
        <polyline className={wireClass(r.carryOut)} points={pts(OR1.out, [540, OR1.out[1]])} />
        <text className="circuit__label" x={480} y={OR1.out[1] + 30}>Cout = {r.carryOut}</text>
      </svg>

      <dl id={wiresId} className="wire-list">
        <div><dt>A XOR B</dt><dd>{aXorB}</dd></div>
        <div><dt>A AND B</dt><dd>{aAndB}</dd></div>
        <div><dt>Carry in AND (A XOR B)</dt><dd>{cinAndAXorB}</dd></div>
        <div><dt>Sum = (A XOR B) XOR carry in</dt><dd>{r.sum}</dd></div>
        <div><dt>Carry out = (A AND B) OR (carry in AND (A XOR B))</dt><dd>{r.carryOut}</dd></div>
      </dl>
      <p className="hint">
        {a} + {b} + {cin} = {a + b + cin}, which is <span className="mono">{r.carryOut}{r.sum}</span> in binary: carry
        out {r.carryOut}, sum {r.sum}.
      </p>
    </ExhibitFigure>
  );
}
