import { describe, expect, it } from 'vitest';
import { skyStateFor } from '../../lighting/domain/dayNight';
import {
  AUTUMN_HOUR,
  HOLD_SECONDS,
  TURN_SECONDS,
  blendAt,
  breakHour,
  breakWeatherAt,
  furledWith,
  lookAt,
  offSeasonSky,
  settledTurn,
  swellAt,
  turnTowards,
  type Turn,
} from './offSeason';

const channels = (color: number): number[] => [
  (color >> 16) & 0xff,
  (color >> 8) & 0xff,
  color & 0xff,
];
const spread = (color: number): number =>
  Math.max(...channels(color)) - Math.min(...channels(color));
const brightness = (color: number): number => channels(color).reduce((sum, value) => sum + value);

describe('blendAt', () => {
  const ending: Turn = { from: 0, to: 1, since: 10 };

  it('holds the summer, then turns to the off-season', () => {
    expect(blendAt(ending, 10)).toBe(0);
    expect(blendAt(ending, 10 + HOLD_SECONDS)).toBe(0);
    expect(blendAt(ending, 10 + HOLD_SECONDS + TURN_SECONDS / 2)).toBeCloseTo(0.5);
    expect(blendAt(ending, 10 + HOLD_SECONDS + TURN_SECONDS)).toBe(1);
    expect(blendAt(ending, 1000)).toBe(1);
  });

  it('turns back at once when the next season opens', () => {
    const opening: Turn = { from: 1, to: 0, since: 50 };
    expect(blendAt(opening, 50)).toBe(1);
    expect(blendAt(opening, 50 + TURN_SECONDS / 2)).toBeCloseTo(0.5);
    expect(blendAt(opening, 50 + TURN_SECONDS)).toBe(0);
  });

  it('starts a reversed turn from where the blend stood', () => {
    const now = 10 + HOLD_SECONDS + TURN_SECONDS / 4;
    const stood = blendAt(ending, now);
    const back = turnTowards(ending, false, now);
    expect(stood).toBeGreaterThan(0);
    expect(blendAt(back, now)).toBe(stood);
    expect(blendAt(back, now + TURN_SECONDS)).toBe(0);
  });

  it('keeps a turn going that is already headed the asked way', () => {
    expect(turnTowards(ending, true, 13)).toBe(ending);
  });

  it('settles without a turn, as a load does', () => {
    expect(blendAt(settledTurn(true), 0)).toBe(1);
    expect(blendAt(settledTurn(true), 1e6)).toBe(1);
    expect(blendAt(settledTurn(false), 1e6)).toBe(0);
  });
});

describe('offSeasonSky', () => {
  it('leaves the summer sky as it is', () => {
    const sky = skyStateFor(14 / 24);
    expect(offSeasonSky(sky, 0)).toBe(sky);
  });

  it('dims the light, cools the shade and greys the sky by day', () => {
    const sky = skyStateFor(14 / 24);
    const autumn = offSeasonSky(sky, 1);
    expect(autumn.ambientIntensity).toBeLessThan(sky.ambientIntensity);
    expect(autumn.sunIntensity).toBeLessThan(sky.sunIntensity);
    expect(spread(autumn.skyColor)).toBeLessThan(spread(sky.skyColor));
    expect(spread(autumn.zenithColor)).toBeLessThan(spread(sky.zenithColor));
  });

  it('never brightens a night', () => {
    const sky = skyStateFor(1 / 24);
    const autumn = offSeasonSky(sky, 1);
    expect(autumn.ambientIntensity).toBeLessThanOrEqual(sky.ambientIntensity);
    expect(autumn.sunIntensity).toBeLessThanOrEqual(sky.sunIntensity);
    for (const key of ['ambientColor', 'sunColor', 'skyColor', 'zenithColor'] as const) {
      expect(brightness(autumn[key]), key).toBeLessThanOrEqual(brightness(sky[key]));
    }
  });
});

describe('breakHour', () => {
  it('lands on the autumn hour from the morning and from late evening', () => {
    expect(breakHour(10 / 24, 1)).toBeCloseTo(AUTUMN_HOUR);
    expect(breakHour(21 / 24, 1)).toBeCloseTo(AUTUMN_HOUR);
    expect(breakHour(3 + 21 / 24, 1)).toBeCloseTo(AUTUMN_HOUR);
  });

  it('keeps the clock hour at no blend and goes the short way round', () => {
    expect(breakHour(10 / 24, 0)).toBeCloseTo(10 / 24);
    const halfway = breakHour(21 / 24, 0.5);
    expect(halfway).toBeGreaterThan(AUTUMN_HOUR);
    expect(halfway).toBeLessThan(21 / 24);
  });

  it('stays within a day', () => {
    for (const time of [0, 0.1, 0.5, 0.99, 2.3, -0.2]) {
      for (const blend of [0, 0.3, 0.7, 1]) {
        const hour = breakHour(time, blend);
        expect(hour).toBeGreaterThanOrEqual(0);
        expect(hour).toBeLessThan(1);
      }
    }
  });
});

describe('breakWeatherAt', () => {
  const hour = Array.from({ length: 3600 }, (_, second) => breakWeatherAt(second + 0.5));

  it('is mostly dry and grey, with drizzle and a storm, never a heatwave', () => {
    const dry = hour.filter((weather) => weather === 'clear').length;
    expect(dry).toBeGreaterThanOrEqual(1800);
    expect(hour).toContain('rain');
    expect(hour).toContain('storm');
    expect(hour).not.toContain('heatwave');
  });

  it('never storms for longer than one spell', () => {
    let longest = 0;
    let run = 0;
    for (const weather of hour) {
      run = weather === 'storm' ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    expect(longest).toBeLessThanOrEqual(90);
  });

  it('is the same every time', () => {
    expect(Array.from({ length: 3600 }, (_, second) => breakWeatherAt(second + 0.5))).toEqual(hour);
  });
});

describe('lookAt', () => {
  it('is summer outside a break', () => {
    expect(lookAt(settledTurn(false), 100, 100)).toEqual({ blend: 0, weather: null });
  });

  it('draws its own weather once the turn is past halfway', () => {
    const ending: Turn = { from: 0, to: 1, since: 0 };
    expect(lookAt(ending, HOLD_SECONDS + TURN_SECONDS / 4, 0).weather).toBeNull();
    expect(lookAt(ending, HOLD_SECONDS + TURN_SECONDS, 0).weather).toBe(breakWeatherAt(0));
  });
});

describe('swellAt', () => {
  it('leaves the summer sea alone and roughens it in a break', () => {
    expect(swellAt(0)).toBe(1);
    expect(swellAt(1)).toBeGreaterThan(1);
  });
});

describe('furledWith', () => {
  it('furls every parasol in a break, whatever the hour', () => {
    expect(furledWith(0, 1)).toBe(1);
    expect(furledWith(0.3, 0.5)).toBe(0.5);
    expect(furledWith(0.8, 0.5)).toBe(0.8);
    expect(furledWith(0.4, 0)).toBe(0.4);
  });
});
