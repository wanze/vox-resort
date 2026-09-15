import { describe, expect, it } from 'vitest';
import { MAX_SUBSTEPS } from '../../crowd/domain/crowd';
import { crowdScaleFor } from './crowdRate';
import { SIM_SPEEDS, SPEED_DAY_SECONDS } from './simClock';

describe('crowdScaleFor', () => {
  it('gives every speed a finite scale of at least 1', () => {
    for (const speed of SIM_SPEEDS) {
      expect(Number.isFinite(crowdScaleFor(speed)), speed).toBe(true);
      expect(crowdScaleFor(speed), speed).toBeGreaterThanOrEqual(1);
    }
  });

  it('never walks a faster preset slower than a slower one', () => {
    const running = SIM_SPEEDS.filter((speed) => speed !== 'paused').toSorted(
      (a, b) => SPEED_DAY_SECONDS[b] - SPEED_DAY_SECONDS[a],
    );
    for (let i = 1; i < running.length; i++) {
      expect(crowdScaleFor(running[i]!), running[i]).toBeGreaterThanOrEqual(
        crowdScaleFor(running[i - 1]!),
      );
    }
  });

  it('caps at the most sub-steps a crowd step runs, and only rush reaches it', () => {
    expect(crowdScaleFor('rush')).toBe(MAX_SUBSTEPS);
    expect(crowdScaleFor('fast')).toBeLessThan(MAX_SUBSTEPS);
    // Pinned, so a change to the share or a preset is a change somebody made.
    expect(crowdScaleFor('slow')).toBeCloseTo(3.56, 2);
    expect(crowdScaleFor('normal')).toBeCloseTo(10.67, 2);
    expect(crowdScaleFor('fast')).toBeCloseTo(26.67, 2);
  });

  it('is 1 while paused', () => {
    expect(crowdScaleFor('paused')).toBe(1);
  });
});
