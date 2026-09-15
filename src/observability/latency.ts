/**
 * Percentile with linear interpolation between closest ranks
 * (same definition as NumPy's default). Returns null for empty input.
 */
export function percentile(values: readonly number[], p: number): number | null {
  if (p < 0 || p > 100) throw new RangeError(`percentile must be within [0, 100], got ${p}`);
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const lo = sorted[lower]!;
  const hi = sorted[upper]!;
  return lo + (hi - lo) * (rank - lower);
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
