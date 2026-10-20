import type { Bit, GateType } from '../sim/gates';

/**
 * Distinctive-shape (ANSI/IEEE 91) gate symbols in a 100 × 60 box.
 * Inputs enter at x = 0 (y = 20 and 40; NOT at y = 30); the output leaves at (100, 30).
 */
const OR_FAMILY = new Set<GateType>(['OR', 'NOR', 'XOR', 'XNOR']);
const INVERTING = new Set<GateType>(['NAND', 'NOR', 'XNOR', 'NOT']);

export function gateInputY(type: GateType, index: number): number {
  if (type === 'NOT') return 30;
  return index === 0 ? 20 : 40;
}

export function wireClass(value: Bit | undefined): string {
  if (value === undefined) return 'wire';
  return value ? 'wire wire--on' : 'wire wire--off';
}

function geometry(type: GateType) {
  const right = type === 'NOT' ? 70 : OR_FAMILY.has(type) ? 76 : 72;
  // Where input leads meet the body (the OR family's back edge is curved).
  const leadEnd = type === 'NOT' ? 24 : type === 'XOR' || type === 'XNOR' ? 19 : OR_FAMILY.has(type) ? 27 : 22;
  const bubble = INVERTING.has(type);
  return { right, leadEnd, bubble, outStart: bubble ? right + 8 : right };
}

function Body({ type }: { type: GateType }) {
  if (type === 'NOT') return <path d="M24 10 L70 30 L24 50 Z" vectorEffect="non-scaling-stroke" />;
  if (OR_FAMILY.has(type)) {
    return (
      <>
        <path d="M22 6 Q48 6 76 30 Q48 54 22 54 Q34 30 22 6 Z" vectorEffect="non-scaling-stroke" />
        {(type === 'XOR' || type === 'XNOR') && (
          <path className="gate__back" d="M14 6 Q26 30 14 54" fill="none" vectorEffect="non-scaling-stroke" />
        )}
      </>
    );
  }
  return <path d="M22 6 H48 A24 24 0 0 1 48 54 H22 Z" vectorEffect="non-scaling-stroke" />;
}

interface GateSymbolProps {
  type: GateType;
  inputs?: readonly Bit[];
  output?: Bit;
  x?: number;
  y?: number;
  scale?: number;
}

export function GateSymbol({ type, inputs, output, x = 0, y = 0, scale = 1 }: GateSymbolProps) {
  const { right, leadEnd, bubble, outStart } = geometry(type);
  const count = type === 'NOT' ? 1 : 2;
  return (
    <g className="gate" transform={`translate(${x} ${y}) scale(${scale})`}>
      {Array.from({ length: count }, (_, i) => (
        <line
          key={i}
          className={wireClass(inputs?.[i])}
          x1={0}
          y1={gateInputY(type, i)}
          x2={leadEnd}
          y2={gateInputY(type, i)}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <g className="gate__body">
        <Body type={type} />
        {bubble && <circle cx={right + 4} cy={30} r={4} vectorEffect="non-scaling-stroke" />}
      </g>
      <line className={wireClass(output)} x1={outStart} y1={30} x2={100} y2={30} vectorEffect="non-scaling-stroke" />
    </g>
  );
}
