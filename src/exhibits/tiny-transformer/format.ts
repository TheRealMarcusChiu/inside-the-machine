/** Display a number with at most `digits` decimals, a true minus sign, and no "-0". */
export function fmt(n: number, digits = 3): string {
  const rounded = Number(n.toFixed(digits));
  if (rounded === 0) return '0';
  const text = String(Math.abs(rounded));
  return rounded < 0 ? `−${text}` : text;
}

/** Display a number with exactly `digits` decimals (for columns of probabilities). */
export function fixed(n: number, digits = 3): string {
  const text = Math.abs(n).toFixed(digits);
  return n < 0 && Number(text) !== 0 ? `−${text}` : text;
}

/** "[1, 0, −0.5]" */
export function fmtVector(v: readonly number[], digits = 3): string {
  return `[${v.map((x) => fmt(x, digits)).join(', ')}]`;
}

/** Wrap negatives in parentheses inside a written-out sum: 2 × (−1). */
export function term(n: number, digits = 3): string {
  return n < 0 ? `(${fmt(n, digits)})` : fmt(n, digits);
}
