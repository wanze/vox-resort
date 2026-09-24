export interface FpsState {
  readonly lastFrameMs: number | null;
  readonly windowMs: number;
  readonly windowFrames: number;
  readonly fps: number;
}

export interface FpsSample {
  readonly state: FpsState;
  readonly updated: boolean;
}

const DEFAULT_REPORT_INTERVAL_MS = 500;

export function createFpsState(): FpsState {
  return { lastFrameMs: null, windowMs: 0, windowFrames: 0, fps: 0 };
}

export function sampleFrame(
  state: FpsState,
  nowMs: number,
  reportIntervalMs: number = DEFAULT_REPORT_INTERVAL_MS,
): FpsSample {
  // Three.js calls the animation loop once without a timestamp before the first frame.
  if (!Number.isFinite(nowMs)) return { state, updated: false };
  if (state.lastFrameMs === null) {
    return { state: { ...state, lastFrameMs: nowMs }, updated: false };
  }
  const delta = nowMs - state.lastFrameMs;
  if (delta < 0) {
    return { state: { ...createFpsState(), lastFrameMs: nowMs, fps: state.fps }, updated: false };
  }
  const windowMs = state.windowMs + delta;
  const windowFrames = state.windowFrames + 1;
  if (windowMs < reportIntervalMs) {
    return { state: { ...state, lastFrameMs: nowMs, windowMs, windowFrames }, updated: false };
  }
  return {
    state: {
      lastFrameMs: nowMs,
      windowMs: 0,
      windowFrames: 0,
      fps: Math.round((windowFrames / windowMs) * 1000),
    },
    updated: true,
  };
}
