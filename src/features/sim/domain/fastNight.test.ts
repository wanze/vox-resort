import { describe, expect, it } from 'vitest';
import {
  FAST_NIGHT_DAY_SECONDS,
  fastNightPace,
  isQuietNight,
  mayRunFast,
  type NightFacts,
} from './fastNight';
import { MAX_TICKS_PER_ADVANCE, SIM_SPEEDS, SPEED_DAY_SECONDS, TICKS_PER_DAY } from './simClock';

const HOUR = 60;

const quiet: NightFacts = {
  tickOfDay: 3 * HOUR,
  staffOnShift: 0,
  awake: 0,
  present: 300,
  eventOn: false,
  lateOpen: false,
};

const OPEN_GATE = {
  on: true,
  speed: 'normal' as const,
  between: false,
  welcome: false,
  following: false,
  photo: false,
  building: false,
  inspecting: false,
};

describe('isQuietNight', () => {
  it('is quiet once the staff are gone and the guests asleep', () => {
    expect(isQuietNight(quiet)).toBe(true);
    expect(isQuietNight({ ...quiet, tickOfDay: 22 * HOUR })).toBe(true);
  });

  it('is never quiet outside the night, ending as the staff come back at five', () => {
    expect(isQuietNight({ ...quiet, tickOfDay: 5 * HOUR - 1 })).toBe(true);
    expect(isQuietNight({ ...quiet, tickOfDay: 5 * HOUR })).toBe(false);
    expect(isQuietNight({ ...quiet, tickOfDay: 21 * HOUR })).toBe(false);
  });

  it('waits for the staff, the club, the shows and the fireworks', () => {
    expect(isQuietNight({ ...quiet, staffOnShift: 1 })).toBe(false);
    expect(isQuietNight({ ...quiet, lateOpen: true })).toBe(false);
    expect(isQuietNight({ ...quiet, eventOn: true })).toBe(false);
  });

  it('waits for nearly every guest to be in bed, not the last straggler', () => {
    expect(isQuietNight({ ...quiet, awake: 15 })).toBe(true);
    expect(isQuietNight({ ...quiet, awake: 16 })).toBe(false);
    expect(isQuietNight({ ...quiet, present: 20, awake: 2 })).toBe(true);
    expect(isQuietNight({ ...quiet, present: 20, awake: 3 })).toBe(false);
  });
});

describe('mayRunFast', () => {
  it('runs with the option on and the player only watching the resort go by', () => {
    expect(mayRunFast(OPEN_GATE)).toBe(true);
  });

  it('drops back while following, in photo mode, building or inspecting', () => {
    for (const key of ['following', 'photo', 'building', 'inspecting']) {
      expect(mayRunFast({ ...OPEN_GATE, [key]: true }), key).toBe(false);
    }
  });

  it('never runs with the option off, paused, between seasons or on the welcome screen', () => {
    expect(mayRunFast({ ...OPEN_GATE, on: false })).toBe(false);
    expect(mayRunFast({ ...OPEN_GATE, speed: 'paused' })).toBe(false);
    expect(mayRunFast({ ...OPEN_GATE, between: true })).toBe(false);
    expect(mayRunFast({ ...OPEN_GATE, welcome: true })).toBe(false);
  });
});

describe('fastNightPace', () => {
  it('is 1 unless the night is quiet, and never moves a paused clock', () => {
    expect(fastNightPace('normal', false)).toBe(1);
    expect(fastNightPace('paused', true)).toBe(1);
  });

  it('runs the night at the same few seconds at every speed', () => {
    for (const speed of SIM_SPEEDS.filter((each) => each !== 'paused')) {
      const daySeconds = SPEED_DAY_SECONDS[speed] / fastNightPace(speed, true);
      expect(daySeconds, speed).toBe(FAST_NIGHT_DAY_SECONDS);
    }
  });

  it('stays well inside the ticks a frame can take at 60 fps', () => {
    const ticksPerFrame = TICKS_PER_DAY / FAST_NIGHT_DAY_SECONDS / 60;
    expect(ticksPerFrame).toBeLessThan(MAX_TICKS_PER_ADVANCE / 4);
    expect(ticksPerFrame).toBeGreaterThan(1);
  });
});
