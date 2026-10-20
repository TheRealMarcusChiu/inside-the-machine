/**
 * Every interactive figure in the museum is one of two kinds, and says so:
 * - a live simulation computes what you see from a real model, in response to you;
 * - an explanatory animation is a scripted illustration of an idea.
 * The two badges differ in icon, wording and border style, not only colour.
 */
export type FigureKind = 'simulation' | 'explanation';

export const KIND_LABEL: Record<FigureKind, string> = {
  simulation: 'Live simulation',
  explanation: 'Explanatory animation',
};

export function KindBadge({ kind, id }: { kind: FigureKind; id?: string }) {
  return (
    <span id={id} className={`kind-badge kind-badge--${kind}`}>
      <span className="kind-badge__icon" aria-hidden="true">
        {kind === 'simulation' ? '●' : '▷'}
      </span>
      {KIND_LABEL[kind]}
    </span>
  );
}
