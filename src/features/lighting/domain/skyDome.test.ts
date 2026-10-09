import { describe, expect, it } from 'vitest';
import { overcastSky, skyStateFor, type Vector3 } from './dayNight';
import { skyColourAt } from './skyDome';

const at = (hours: number, minutes = 0): number => (hours + minutes / 60) / 24;

const channels = (color: number): number[] => [
  (color >> 16) & 0xff,
  (color >> 8) & 0xff,
  color & 0xff,
];

const brightness = (color: number): number =>
  channels(color).reduce((sum, each) => sum + each, 0) / 3;

const unit = (x: number, y: number, z: number): Vector3 => {
  const length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
};

// A spread of directions over the whole sphere, the same every run.
const SPHERE: readonly Vector3[] = Array.from({ length: 200 }, (_unused, index) => {
  const y = 1 - (2 * (index + 0.5)) / 200;
  const around = index * 2.399963;
  const radius = Math.sqrt(1 - y * y);
  return { x: Math.cos(around) * radius, y, z: Math.sin(around) * radius };
});

const UP: Vector3 = { x: 0, y: 1, z: 0 };

describe('skyColourAt', () => {
  it('is exactly the horizon colour at and below the horizon, so it meets the fog', () => {
    for (const time of [at(0), at(6), at(13, 45), at(21, 15)]) {
      const sky = skyStateFor(time);
      for (const direction of SPHERE.filter((each) => each.y <= 0)) {
        expect(skyColourAt(sky, direction)).toBe(sky.skyColor);
      }
      expect(skyColourAt(sky, { x: 1, y: 0, z: 0 })).toBe(sky.skyColor);
    }
  });

  it('is exactly the zenith colour straight up with no glow and no band', () => {
    const midnight = skyStateFor(at(0));
    expect(midnight.sunGlow).toBe(0);
    expect(midnight.dusk).toBe(0);
    expect(skyColourAt(midnight, UP)).toBe(midnight.zenithColor);
    const storm = overcastSky(skyStateFor(at(13, 45)), 1);
    expect(skyColourAt(storm, UP)).toBe(storm.zenithColor);
  });

  it('is brightest where the sun is at noon', () => {
    const noon = skyStateFor(at(13, 45));
    const sun = brightness(skyColourAt(noon, noon.sunDirection));
    const others = SPHERE.filter((each) => each.y > 0).slice(0, 100);
    expect(others).toHaveLength(100);
    for (const direction of others) {
      expect(brightness(skyColourAt(noon, direction))).toBeLessThan(sun);
    }
  });

  it('is redder low on the sun’s side at a quarter past nine in the evening', () => {
    const evening = skyStateFor(at(21, 15));
    const { x, z } = evening.sunDirection;
    const warmth = (color: number): number => channels(color)[0]! - channels(color)[2]!;
    const toward = skyColourAt(evening, unit(x, 0.05, z));
    const away = skyColourAt(evening, unit(-x, 0.05, -z));
    expect(warmth(toward)).toBeGreaterThan(warmth(away));
  });

  it('never leaves 0..255 on any channel', () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      for (const sky of [skyStateFor(at(hour)), overcastSky(skyStateFor(at(hour)), 0.85)]) {
        for (const direction of SPHERE) {
          const color = skyColourAt(sky, direction);
          expect(color).toBeGreaterThanOrEqual(0);
          expect(color).toBeLessThanOrEqual(0xffffff);
          expect(Number.isInteger(color)).toBe(true);
        }
      }
    }
  });
});
