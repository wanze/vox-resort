import { describe, expect, it } from 'vitest';
import { strikesBetween } from '../../weather/domain/lightning';
import { rainVoice, surfAt, thunderDue, thunderOf, windVoice } from './synth';

describe('thunderOf', () => {
  it('comes after its flash, never before, within three and a half seconds', () => {
    for (const strike of strikesBetween(0, 600)) {
      const thunder = thunderOf(strike);
      expect(thunder.at).toBeGreaterThanOrEqual(strike.at + 0.3);
      expect(thunder.at).toBeLessThanOrEqual(strike.at + 3.5);
      expect(thunder.rumbleSeconds).toBeGreaterThanOrEqual(2.5);
      expect(thunder.rumbleSeconds).toBeLessThanOrEqual(6);
    }
  });

  it('comes sooner and louder from a stronger strike', () => {
    const near = thunderOf({ at: 40, strength: 1 });
    const far = thunderOf({ at: 40, strength: 0.5 });
    expect(near.at).toBeLessThan(far.at);
    expect(near.gain).toBeGreaterThan(far.gain);
    expect(near.crack).toBe(true);
    expect(far.crack).toBe(false);
  });
});

describe('thunderDue', () => {
  it('schedules every thunder exactly once across consecutive calls', () => {
    const scheduled: number[] = [];
    let last = 0;
    for (let now = 0; now < 300; now += 0.2) {
      const due = thunderDue(last, now, 1);
      scheduled.push(...due.map((thunder) => thunder.at));
      last = now + 1;
    }
    const expected = strikesBetween(-1, 299)
      .map(thunderOf)
      .map((thunder) => thunder.at)
      .filter((at) => at <= 300);
    expect(scheduled).toEqual(expected);
  });

  it('plays nothing late after a long pause', () => {
    expect(thunderDue(0, 200, 0.5).every((thunder) => thunder.at > 200)).toBe(true);
  });
});

describe('rainVoice and windVoice', () => {
  it('grow louder with the level, the rain lower and fuller', () => {
    let rain = rainVoice(0);
    let wind = windVoice(0, 12);
    for (let level = 0.1; level <= 1; level += 0.1) {
      const nextRain = rainVoice(level);
      const nextWind = windVoice(level, 12);
      expect(nextRain.gain).toBeGreaterThan(rain.gain);
      expect(nextRain.lowpassHz).toBeLessThan(rain.lowpassHz);
      expect(nextRain.highpassHz).toBeLessThan(rain.highpassHz);
      expect(nextWind.gain).toBeGreaterThan(wind.gain);
      expect(nextWind.bandHz).toBeGreaterThan(wind.bandHz);
      rain = nextRain;
      wind = nextWind;
    }
  });
});

describe('surfAt', () => {
  it('stays within the level', () => {
    for (let seconds = 0; seconds < 120; seconds += 0.05) {
      const swell = surfAt(seconds, 0.7);
      expect(swell).toBeGreaterThanOrEqual(0);
      expect(swell).toBeLessThanOrEqual(0.7);
    }
  });

  it('does not repeat every eight seconds over a minute', () => {
    let apart = 0;
    for (let seconds = 0; seconds < 52; seconds += 0.25) {
      apart = Math.max(apart, Math.abs(surfAt(seconds, 1) - surfAt(seconds + 8, 1)));
    }
    expect(apart).toBeGreaterThan(0.2);
  });
});
