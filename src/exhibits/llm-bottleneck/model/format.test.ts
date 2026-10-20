import { describe, expect, it } from 'vitest';
import { formatBytes, formatFlops, formatIntensity, formatRate, formatSeconds, formatSI, formatTokensPerSecond } from './format';

describe('SI formatting (decimal prefixes: 1 GB = 10⁹ bytes)', () => {
  it('uses three significant figures and decimal prefixes', () => {
    expect(formatSI(14e9, 'B')).toBe('14.0 GB');
    expect(formatSI(2 * 1024 ** 3, 'B')).toBe('2.15 GB');
    expect(formatSI(999, 'B')).toBe('999 B');
    expect(formatSI(1000, 'B')).toBe('1.00 kB');
    expect(formatSI(123_456_789_000_000, 'FLOP')).toBe('123 TFLOP');
    expect(formatSI(0, 'B')).toBe('0 B');
  });

  it('rolls over to the next prefix when rounding reaches 1000', () => {
    expect(formatSI(999_600, 'B')).toBe('1.00 MB');
  });

  it('formats the named quantities', () => {
    expect(formatBytes(14e9)).toBe('14.0 GB');
    expect(formatFlops(14e9 + 2 * 1024 ** 3)).toBe('16.1 GFLOP');
    expect(formatRate(2e12)).toBe('2.00 TFLOP/s');
    expect(formatIntensity(1)).toBe('1.00 FLOP/byte');
    expect(formatIntensity(3823.6)).toBe('3,820 FLOP/byte');
    expect(formatIntensity(0.0123)).toBe('0.0123 FLOP/byte');
    expect(formatTokensPerSecond(123.86)).toBe('124 tokens/s');
    expect(formatTokensPerSecond(20698)).toBe('20,700 tokens/s');
  });

  it('formats durations from nanoseconds to seconds', () => {
    expect(formatSeconds(0.0080737)).toBe('8.07 ms');
    expect(formatSeconds(0.19789)).toBe('198 ms');
    expect(formatSeconds(5.2e-5)).toBe('52.0 µs');
    expect(formatSeconds(3.4e-9)).toBe('3.40 ns');
    expect(formatSeconds(12.345)).toBe('12.3 s');
    expect(formatSeconds(4321)).toBe('4,320 s');
  });
});
