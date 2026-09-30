import { describe, expect, it } from 'vitest';
import { RESTING } from '../../crowd/domain/crowd';
import { DRAWN_POSE, poseWith } from './poses';

describe('DRAWN_POSE', () => {
  it('continues after the crowd’s own poses with no gap and no overlap', () => {
    const codes = [...Object.values(RESTING), ...Object.values(DRAWN_POSE)].toSorted(
      (a, b) => a - b,
    );
    expect(codes).toEqual(codes.map((_, index) => index));
    expect(Math.min(...Object.values(DRAWN_POSE))).toBe(RESTING.lying + 1);
  });
});

describe('poseWith', () => {
  it('keeps the code under the floor for any progress', () => {
    for (const code of Object.values(DRAWN_POSE)) {
      for (const progress of [-1, 0, 0.25, 0.5, 0.999, 1, 7]) {
        expect(Math.floor(Math.fround(poseWith(code, progress))), `${code} + ${progress}`).toBe(
          code,
        );
      }
    }
    expect(poseWith(DRAWN_POSE.strike, 0.5)).toBe(DRAWN_POSE.strike + 0.5);
  });
});
