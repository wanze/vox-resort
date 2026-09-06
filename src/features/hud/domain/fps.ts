/**
 * Pure frame-rate sampling. The caller owns the state object and feeds it
 * timestamps; nothing here reads a clock.
 */

export interface FpsState {
  /** Timestamp of the previous frame, in milliseconds. */
  readonly lastFrameMs: number | null;
  /** Milliseconds accumulated since the last reported update. */
  readonly windowMs: number;
  /** Frames accumulated since the last reported update. */
  readonly windowFrames: number;
  /** Most recently reported frames per second. */
  readonly fps: number;
}

export interface FpsSample {
  readonly state: FpsState;
  /** True when this frame closed a reporting window and `state.fps` changed. */
  readonly updated: boolean;
}

const DEFAULT_REPORT_INTERVAL_MS = 500;

export function createFpsState(): FpsState {
  return { lastFrameMs: null, windowMs: 0, windowFrames: 0, fps: 0 };
}

/**
 * Folds one frame timestamp into the state, reporting a new average once
 * `reportIntervalMs` of wall time has accumulated.
 */
export function sampleFrame(
  state: FpsState,
  nowMs: number,
  reportIntervalMs: number = DEFAULT_REPORT_INTERVAL_MS,
): FpsSample {
  // Three.js invokes the animation loop once without a timestamp before the
  // first real frame, so the first sample can arrive as undefined/NaN.
  if (!Number.isFinite(nowMs)) return { state, updated: false };
  if (state.lastFrameMs === null) {
    return { state: { ...state, lastFrameMs: nowMs }, updated: false };
  }
  const delta = nowMs - state.lastFrameMs;
  if (delta < 0) {
    // A clock that ran backwards; restart the window instead of reporting nonsense.
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
