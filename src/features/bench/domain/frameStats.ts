export interface FrameStats {
  readonly frames: number;
  readonly durationMs: number;
  readonly fps: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly medianFps: number;
}

export function percentile(sorted: readonly number[], quantile: number): number {
  if (sorted.length === 0) return 0;
  const q = Math.min(1, Math.max(0, quantile));
  const position = q * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower]!;
  if (lower === upper) return low;
  return low + (sorted[upper]! - low) * (position - lower);
}

export function summarizeFrames(durationsMs: readonly number[]): FrameStats {
  const clean = durationsMs.filter((value) => Number.isFinite(value) && value > 0);
  if (clean.length === 0) {
    return {
      frames: 0,
      durationMs: 0,
      fps: 0,
      medianMs: 0,
      p95Ms: 0,
      p99Ms: 0,
      minMs: 0,
      maxMs: 0,
      medianFps: 0,
    };
  }
  const sorted = [...clean].toSorted((a, b) => a - b);
  const total = clean.reduce((sum, value) => sum + value, 0);
  const median = percentile(sorted, 0.5);
  return {
    frames: clean.length,
    durationMs: total,
    fps: (clean.length / total) * 1000,
    medianMs: median,
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    minMs: sorted[0]!,
    maxMs: sorted[sorted.length - 1]!,
    medianFps: 1000 / median,
  };
}

const round = (value: number, places: number): number => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

export function roundStats(stats: FrameStats): FrameStats {
  return {
    frames: stats.frames,
    durationMs: round(stats.durationMs, 1),
    fps: round(stats.fps, 1),
    medianMs: round(stats.medianMs, 2),
    p95Ms: round(stats.p95Ms, 2),
    p99Ms: round(stats.p99Ms, 2),
    minMs: round(stats.minMs, 2),
    maxMs: round(stats.maxMs, 2),
    medianFps: round(stats.medianFps, 1),
  };
}
