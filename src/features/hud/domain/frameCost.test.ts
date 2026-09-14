import { describe, expect, it } from 'vitest';
import { createFrameCostState, sampleFrameCost, type FrameCostState } from './frameCost';

function run(frames: readonly (readonly [number, number])[], windowMs = 1000): FrameCostState {
  let state = createFrameCostState();
  for (const [now, cost] of frames) state = sampleFrameCost(state, now, cost, windowMs);
  return state;
}

describe('sampleFrameCost', () => {
  it('reports the latest frame straight away, and no worst until a window closes', () => {
    const state = run([
      [0, 5],
      [16, 7],
    ]);
    expect(state.latestMs).toBe(7);
    expect(state.worstMs).toBe(0);
  });

  it('reports the worst frame of the window that just closed', () => {
    const state = run([
      [0, 5],
      [16, 900],
      [932, 6],
      [1000, 4],
    ]);
    expect(state.worstMs).toBe(900);
    expect(state.latestMs).toBe(4);
  });

  it('lets a stall go once a whole window has passed without one', () => {
    const state = run([
      [0, 900],
      [1000, 5],
      [1500, 6],
      [2000, 5],
    ]);
    expect(state.worstMs).toBe(6);
  });

  it('ignores a frame with no timestamp or no measurement', () => {
    const before = run([[0, 5]]);
    expect(sampleFrameCost(before, Number.NaN, 5)).toBe(before);
    expect(sampleFrameCost(before, 10, Number.NaN)).toBe(before);
  });

  it('starts over when the clock runs backwards', () => {
    const state = run([
      [1000, 5],
      [500, 8],
      [1400, 3],
    ]);
    expect(state.windowStartMs).toBe(500);
    expect(state.worstMs).toBe(0);
  });
});
