import { describe, expect, it } from 'vitest';
import { flashAt, flashSky } from './lightning';
import { skyStateFor } from '../../lighting/domain/dayNight';

function sample(seconds: number, step = 0.01): number[] {
  const seen: number[] = [];
  for (let at = 0; at < seconds; at += step) seen.push(flashAt(at));
  return seen;
}

describe('flashAt', () => {
  it('is dark almost all of the time', () => {
    const seen = sample(120);
    const alight = seen.filter((value) => value > 0).length;
    expect(alight).toBeGreaterThan(0);
    expect(alight / seen.length).toBeLessThan(0.1);
  });

  it('never leaves the 0..1 it promises', () => {
    for (const value of sample(300, 0.007)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('strikes several times over a couple of minutes', () => {
    const seen = sample(120);
    let strikes = 0;
    for (let at = 0; at < seen.length; at++) {
      if (seen[at]! > 0 && (at === 0 || seen[at - 1] === 0)) strikes++;
    }
    expect(strikes).toBeGreaterThanOrEqual(6);
    expect(strikes).toBeLessThanOrEqual(14);
  });

  it('gives the same storm twice, so a bench run replays', () => {
    expect(sample(40)).toEqual(sample(40));
  });

  it('is dark before the resort opened', () => {
    expect(flashAt(-3)).toBe(0);
  });
});

describe('flashSky', () => {
  const sky = skyStateFor(0.55);

  it('hands back the sky it was given when nothing is flashing', () => {
    expect(flashSky(sky, 0)).toBe(sky);
  });

  it('adds light rather than replacing it, and leaves the sun and the lamps alone', () => {
    const lit = flashSky(sky, 1);
    expect(lit.ambientIntensity).toBeGreaterThan(sky.ambientIntensity);
    expect(lit.skyColor).not.toBe(sky.skyColor);
    expect(lit.sunIntensity).toBe(sky.sunIntensity);
    expect(lit.sunColor).toBe(sky.sunColor);
    expect(lit.lampFactor).toBe(sky.lampFactor);
    expect(lit.sunDirection).toEqual(sky.sunDirection);
  });

  it('lights a midnight sky as far above its own darkness as a midday one', () => {
    const night = skyStateFor(0.02);
    expect(flashSky(night, 1).ambientIntensity - night.ambientIntensity).toBeCloseTo(
      flashSky(sky, 1).ambientIntensity - sky.ambientIntensity,
      6,
    );
  });

  it('clamps a number from outside rather than overdriving the ambient', () => {
    expect(flashSky(sky, 40)).toEqual(flashSky(sky, 1));
    expect(flashSky(sky, -2)).toBe(sky);
  });
});
