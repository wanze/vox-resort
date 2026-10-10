import { describe, expect, it } from 'vitest';
import {
  advanceClock,
  createSimClock,
  MAX_TICKS_PER_ADVANCE,
  SIM_SPEEDS,
  TICKS_PER_DAY,
  withSpeed,
} from '../../sim/domain/simClock';
import { TURBO_DAY_SECONDS, turboPace } from './turbo';

const FRAME = 1 / 60;

describe('turboPace', () => {
  it('leaves every speed alone while off', () => {
    for (const speed of SIM_SPEEDS) expect(turboPace(speed, false)).toBe(1);
  });

  it('leaves a paused clock paused', () => {
    expect(turboPace('paused', true)).toBe(1);
  });

  it('runs a day in two seconds at 60 fps, whatever the speed', () => {
    for (const speed of ['slow', 'normal', 'fast', 'rush'] as const) {
      let clock = withSpeed(createSimClock(0, 0), speed);
      let ticks = 0;
      for (let frame = 0; frame < TURBO_DAY_SECONDS * 60; frame++) {
        const advanced = advanceClock(clock, FRAME * turboPace(speed, true));
        clock = advanced.clock;
        ticks += advanced.ticks;
        expect(advanced.ticks).toBeLessThanOrEqual(MAX_TICKS_PER_ADVANCE);
      }
      expect(ticks).toBe(TICKS_PER_DAY);
    }
  });
});
