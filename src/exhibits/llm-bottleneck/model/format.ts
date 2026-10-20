/** Display formatting. Decimal SI prefixes throughout: 1 GB = 10⁹ bytes, 1 TFLOP/s = 10¹² FLOP/s. */

const PREFIXES = ['', 'k', 'M', 'G', 'T', 'P', 'E', 'Z'] as const;

/** Three significant figures; thousands separators once the number reaches 1000. */
export function sig3(n: number): string {
  if (n === 0) return '0';
  const rounded = Number(n.toPrecision(3));
  if (Math.abs(rounded) >= 1000) return rounded.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return rounded.toPrecision(3);
}

export function formatSI(value: number, unit: string): string {
  if (value === 0) return `0 ${unit}`;
  let i = 0;
  let v = value;
  while (Math.abs(Number(v.toPrecision(3))) >= 1000 && i < PREFIXES.length - 1) {
    v /= 1000;
    i++;
  }
  // Below 1000 the plain number already has three significant figures.
  return `${i === 0 && Number.isInteger(v) ? String(v) : Number(v.toPrecision(3)).toPrecision(3)} ${PREFIXES[i]}${unit}`;
}

export const formatBytes = (bytes: number) => formatSI(bytes, 'B');
export const formatFlops = (flops: number) => formatSI(flops, 'FLOP');
export const formatRate = (flopsPerSecond: number) => formatSI(flopsPerSecond, 'FLOP/s');
export const formatIntensity = (flopsPerByte: number) => `${sig3(flopsPerByte)} FLOP/byte`;
export const formatTokensPerSecond = (tps: number) => `${sig3(tps)} tokens/s`;

export function formatSeconds(seconds: number): string {
  if (seconds >= 1) return `${sig3(seconds)} s`;
  if (seconds >= 1e-3) return `${sig3(seconds * 1e3)} ms`;
  if (seconds >= 1e-6) return `${sig3(seconds * 1e6)} µs`;
  return `${sig3(seconds * 1e9)} ns`;
}

/** Whole numbers with thousands separators, e.g. token counts. */
export const formatCount = (n: number) => Math.round(n).toLocaleString('en-US');
