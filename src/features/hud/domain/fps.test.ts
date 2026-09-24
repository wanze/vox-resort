import { describe, expect, it } from 'vitest';
import { createFpsState, sampleFrame, type FpsState } from './fps';

function run(timestamps: readonly number[], interval = 500): FpsState {
  let state = createFpsState();
  for (const timestamp of timestamps) state = sampleFrame(state, timestamp, interval).state;
  return state;
}

describe('sampleFrame', () => {
  it('reports nothing on the very first frame', () => {
    const { state, updated } = sampleFrame(createFpsState(), 1000);
    expect(updated).toBe(false);
    expect(state.fps).toBe(0);
  });

  it('holds the previous reading until the window closes', () => {
    const state = run([0, 16, 32, 48]);
    expect(state.fps).toBe(0);
    expect(state.windowFrames).toBe(3);
  });

  it('averages a steady 60 fps stream', () => {
    const timestamps = Array.from({ length: 61 }, (_, index) => index * (1000 / 60));
    expect(run(timestamps).fps).toBe(60);
  });

  it('averages a steady 30 fps stream', () => {
    const timestamps = Array.from({ length: 31 }, (_, index) => index * (1000 / 30));
    expect(run(timestamps).fps).toBe(30);
  });

  it('flags the frame that closes a window', () => {
    let state = createFpsState();
    state = sampleFrame(state, 0).state;
    const before = sampleFrame(state, 400);
    expect(before.updated).toBe(false);
    expect(sampleFrame(before.state, 900).updated).toBe(true);
  });

  it('resets the window after reporting', () => {
    let state = createFpsState();
    state = sampleFrame(state, 0).state;
    state = sampleFrame(state, 600).state;
    expect(state.windowMs).toBe(0);
    expect(state.windowFrames).toBe(0);
  });

  it('recovers from a clock that runs backwards', () => {
    let state = createFpsState();
    state = sampleFrame(state, 1000).state;
    state = sampleFrame(state, 1600).state;
    const previousFps = state.fps;
    const { state: recovered, updated } = sampleFrame(state, 500);
    expect(updated).toBe(false);
    expect(recovered.fps).toBe(previousFps);
    expect(recovered.windowFrames).toBe(0);
  });

  it('ignores a frame with no timestamp', () => {
    // Three.js calls the animation loop once with `undefined` before the first real frame.
    const first = sampleFrame(createFpsState(), undefined as unknown as number);
    expect(first.state.lastFrameMs).toBeNull();
    const timestamps = Array.from({ length: 61 }, (_, index) => index * (1000 / 60));
    let state = first.state;
    for (const timestamp of timestamps) state = sampleFrame(state, timestamp).state;
    expect(state.fps).toBe(60);
  });

  it('ignores a NaN timestamp mid-stream', () => {
    let state = createFpsState();
    state = sampleFrame(state, 0).state;
    state = sampleFrame(state, Number.NaN).state;
    state = sampleFrame(state, 600).state;
    expect(Number.isFinite(state.fps)).toBe(true);
    expect(state.fps).toBeGreaterThan(0);
  });

  it('honours a custom reporting interval', () => {
    const timestamps = Array.from({ length: 7 }, (_, index) => index * 20);
    expect(run(timestamps, 100).fps).toBe(50);
  });
});
