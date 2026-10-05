import { describe, expect, it } from 'vitest';
import { skyStateFor } from '../../lighting/domain/dayNight';
import { flashSky } from '../../weather/domain/lightning';
import { fireworksSky, showLightAt } from './light';
import { planShow } from './show';

const SITES = Array.from({ length: 5 }, (_, index) => ({ x: 200 + index * 100, y: 0.1, z: 900 }));
const show = planShow({ tier: 'grand', seed: 7, sites: SITES });
const first = show.shells[0]!;

const meanLight = (from: number, to: number): number => {
  let sum = 0;
  let samples = 0;
  for (let playhead = from; playhead < to; playhead += 0.05, samples++) {
    sum += showLightAt(show, playhead).strength;
  }
  return sum / samples;
};

describe('showLightAt', () => {
  it('is dark before the first launch and after the show', () => {
    expect(showLightAt(show, first.launchAt - 0.01).strength).toBe(0);
    expect(showLightAt(show, show.length).strength).toBe(0);
  });

  it('keeps the sand lit while anything is in the air, between the bursts too', () => {
    const last = show.shells.at(-1)!.launchAt;
    for (let playhead = first.launchAt; playhead < last; playhead += 0.05) {
      expect(showLightAt(show, playhead).strength).toBeGreaterThan(0);
    }
  });

  it('flares at a burst, in its colour, and fades back within two seconds', () => {
    const burst = first.launchAt + first.rise;
    const before = showLightAt(show, burst - 0.01);
    const peak = showLightAt(show, burst);
    expect(peak.strength).toBeGreaterThan(before.strength);
    expect(peak.color).not.toBe(before.color);
    expect(showLightAt(show, burst + 0.5).strength).toBeLessThan(peak.strength);
    const next = show.shells[1]!;
    if (next.launchAt + next.rise > burst + 2) {
      expect(showLightAt(show, burst + 2).strength).toBeCloseTo(before.strength);
    }
  });

  it('lights the finale more than the opening', () => {
    expect(meanLight(show.finaleFrom, show.length - 3)).toBeGreaterThan(1.4 * meanLight(0, 10));
  });

  it('stays dark for what was never launched', () => {
    const burst = first.launchAt + first.rise;
    expect(showLightAt(show, burst, first.launchAt - 1).strength).toBe(0);
  });
});

describe('fireworksSky', () => {
  it('never lights the sky as much as a lightning flash', () => {
    const night = skyStateFor(0.95);
    const brightest = fireworksSky(night, { strength: 1, color: 0xffffff });
    const flash = flashSky(night, 1).ambientIntensity - night.ambientIntensity;
    expect(brightest.ambientIntensity - night.ambientIntensity).toBeLessThan(flash);
    expect(fireworksSky(night, { strength: 0, color: 0 })).toBe(night);
  });
});
