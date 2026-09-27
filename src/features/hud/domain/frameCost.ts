// Tracks the worst frame of the last second, because the frame rate averages a stall away.

export interface FrameCostState {
  readonly windowStartMs: number | null;
  readonly windowWorstMs: number;
  readonly windowTotalMs: number;
  readonly windowFrames: number;
  readonly worstMs: number;
  readonly meanMs: number;
  readonly latestMs: number;
}

const DEFAULT_WINDOW_MS = 1000;

export function createFrameCostState(): FrameCostState {
  return {
    windowStartMs: null,
    windowWorstMs: 0,
    windowTotalMs: 0,
    windowFrames: 0,
    worstMs: 0,
    meanMs: 0,
    latestMs: 0,
  };
}

export function sampleFrameCost(
  state: FrameCostState,
  nowMs: number,
  costMs: number,
  windowMs: number = DEFAULT_WINDOW_MS,
): FrameCostState {
  if (!Number.isFinite(nowMs) || !Number.isFinite(costMs)) return state;
  const cost = Math.max(0, costMs);
  if (state.windowStartMs === null || nowMs < state.windowStartMs) {
    return {
      ...state,
      windowStartMs: nowMs,
      windowWorstMs: cost,
      windowTotalMs: cost,
      windowFrames: 1,
      latestMs: cost,
    };
  }
  const windowWorstMs = Math.max(state.windowWorstMs, cost);
  const windowTotalMs = state.windowTotalMs + cost;
  const windowFrames = state.windowFrames + 1;
  if (nowMs - state.windowStartMs < windowMs) {
    return { ...state, windowWorstMs, windowTotalMs, windowFrames, latestMs: cost };
  }
  return {
    windowStartMs: nowMs,
    windowWorstMs: 0,
    windowTotalMs: 0,
    windowFrames: 0,
    worstMs: windowWorstMs,
    meanMs: windowTotalMs / windowFrames,
    latestMs: cost,
  };
}
