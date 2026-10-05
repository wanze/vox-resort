import { describe, expect, it } from 'vitest';
import { advanceClock, createSimClock, withSpeed } from '../../sim/domain/simClock';
import { showPace } from './pace';

describe('showPace', () => {
  it('leaves a paused clock alone', () => {
    expect(showPace({ speed: 'paused', ticksLeft: 30, secondsLeft: 90 })).toBe(1);
  });

  it('only ever slows the clock', () => {
    for (const speed of ['slow', 'normal', 'fast', 'rush'] as const) {
      for (const secondsLeft of [0.5, 5, 90]) {
        expect(showPace({ speed, ticksLeft: 30, secondsLeft })).toBeLessThanOrEqual(1);
      }
    }
    expect(showPace({ speed: 'slow', ticksLeft: 30, secondsLeft: 1 })).toBe(1);
  });

  it('stretches half an hour at Normal over a grand show', () => {
    expect(showPace({ speed: 'normal', ticksLeft: 30, secondsLeft: 90 })).toBeCloseTo(0.0694, 3);
  });

  it('lets go as the show runs out', () => {
    expect(showPace({ speed: 'normal', ticksLeft: 30, secondsLeft: 0 })).toBe(1);
    expect(showPace({ speed: 'normal', ticksLeft: 0, secondsLeft: 10 })).toBe(1);
    expect(showPace({ speed: 'normal', ticksLeft: 30, secondsLeft: 0.01 })).toBe(1);
  });

  it('spends the ticks left over the seconds left', () => {
    const pace = showPace({ speed: 'rush', ticksLeft: 30, secondsLeft: 75 });
    let clock = withSpeed(createSimClock(0, 0.5), 'rush');
    const start = clock.ticks;
    const frame = 1 / 60;
    for (let elapsed = 0; elapsed < 75 - frame / 2; elapsed += frame) {
      clock = advanceClock(clock, frame * pace).clock;
    }
    expect(clock.ticks - start).toBe(30);
  });
});
