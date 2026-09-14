/**
 * What the main thread spends on a frame, and the worst of it lately.
 *
 * The frame rate averages a stall away: one frame of 900 ms among fifty of
 * 16 ms reads as a dip to twenty-something. The worst frame of the last second
 * is what says the page stalled, and the latest one is what a steady view
 * costs. Pure: the caller measures and owns the state.
 */

export interface FrameCostState {
  /** When the open window started, in milliseconds; null before the first frame. */
  readonly windowStartMs: number | null;
  /** Worst frame so far in the open window. */
  readonly windowWorstMs: number;
  /** Worst frame of the last window that closed: what is reported. */
  readonly worstMs: number;
  /** The most recent frame's cost. */
  readonly latestMs: number;
}

const DEFAULT_WINDOW_MS = 1000;

export function createFrameCostState(): FrameCostState {
  return { windowStartMs: null, windowWorstMs: 0, worstMs: 0, latestMs: 0 };
}

/** Folds one frame's measured cost, taken at `nowMs`, into the state. */
export function sampleFrameCost(
  state: FrameCostState,
  nowMs: number,
  costMs: number,
  windowMs: number = DEFAULT_WINDOW_MS,
): FrameCostState {
  if (!Number.isFinite(nowMs) || !Number.isFinite(costMs)) return state;
  const cost = Math.max(0, costMs);
  const windowWorstMs = Math.max(state.windowWorstMs, cost);
  if (state.windowStartMs === null || nowMs < state.windowStartMs) {
    return { ...state, windowStartMs: nowMs, windowWorstMs: cost, latestMs: cost };
  }
  if (nowMs - state.windowStartMs < windowMs) {
    return { ...state, windowWorstMs, latestMs: cost };
  }
  return { windowStartMs: nowMs, windowWorstMs: 0, worstMs: windowWorstMs, latestMs: cost };
}
