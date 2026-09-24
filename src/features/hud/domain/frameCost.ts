// Tracks the worst frame of the last second, because the frame rate averages a stall away.

export interface FrameCostState {
  readonly windowStartMs: number | null;
  readonly windowWorstMs: number;
  readonly worstMs: number;
  readonly latestMs: number;
}

const DEFAULT_WINDOW_MS = 1000;

export function createFrameCostState(): FrameCostState {
  return { windowStartMs: null, windowWorstMs: 0, worstMs: 0, latestMs: 0 };
}

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
