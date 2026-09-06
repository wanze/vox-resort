/**
 * Frame-time statistics for the benchmark harness.
 *
 * The HUD's running average (`hud/domain/fps.ts`) is the right thing to read
 * while flying around; it is the wrong thing to compare two builds with, because
 * it hides the shape of the distribution. A renderer that alternates 8 ms and
 * 40 ms frames and one that holds a steady 24 ms both average the same, and only
 * one of them is pleasant to use.
 *
 * So the harness keeps every frame duration and reports percentiles. Nothing
 * here touches Three.js or the DOM, so the arithmetic is checked by unit test
 * rather than by squinting at a counter.
 */

export interface FrameStats {
  /** Frames the sample is drawn from. */
  readonly frames: number;
  /** Wall-clock span of the sample, in milliseconds. */
  readonly durationMs: number;
  /** Frames per second over the whole sample: `frames / duration`. */
  readonly fps: number;
  /** Frame time at the median, and at the tail. Milliseconds. */
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly minMs: number;
  readonly maxMs: number;
  /** `1000 / medianMs` — the frame rate a typical frame would sustain. */
  readonly medianFps: number;
}

/**
 * Linear-interpolated percentile over an ascending sample.
 *
 * `quantile` is clamped to 0..1; an empty sample has no percentile and yields 0.
 */
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

/** Summarises a run of frame durations. Non-finite and non-positive frames are dropped. */
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

/** Rounds a summary to the precision worth printing in a report. */
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
