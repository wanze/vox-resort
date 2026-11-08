import { describe, expect, it } from 'vitest';
import type { LaunchSite } from './launch';
import { createStarBuffer, writeStars } from './stars';
import { aimAt, stillFor, stillSeed } from './still';

const SITES: readonly LaunchSite[] = Array.from({ length: 4 }, (_, index) => ({
  x: 200 + index * 100,
  y: 0.1,
  z: 900,
}));

const SPOT = { x: 412.3, z: 780.9, minute: 22 * 60 + 5 };

describe('stillSeed', () => {
  it('is the same for the same photo, and another for one taken elsewhere or later', () => {
    expect(stillSeed(SPOT)).toBe(stillSeed({ ...SPOT }));
    expect(stillSeed({ ...SPOT, x: SPOT.x + 8 })).not.toBe(stillSeed(SPOT));
    expect(stillSeed({ ...SPOT, minute: SPOT.minute + 1 })).not.toBe(stillSeed(SPOT));
  });
});

describe('stillFor', () => {
  it('has nothing to show on a plot with no beach to launch from', () => {
    expect(stillFor([], 7)).toBeNull();
  });

  it('picks the same moment for the same seed, with stars in the air', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const still = stillFor(SITES, seed)!;
      expect(still, `seed ${seed}`).not.toBeNull();
      expect(stillFor(SITES, seed)).toEqual(still);
      expect(still.at).toBeGreaterThanOrEqual(0);
      expect(still.at).toBeLessThan(still.show.length);
      expect(writeStars(still.show, still.at, createStarBuffer()), `seed ${seed}`).toBeGreaterThan(
        0,
      );
    }
  });
});

const DEGREE = Math.PI / 180;

const brightStars = (still: NonNullable<ReturnType<typeof stillFor>>) => {
  const stars = createStarBuffer();
  const count = writeStars(still.show, still.at, stars);
  return Array.from({ length: count }, (_, index) => index)
    .filter((index) => stars.scale[index]! >= 1.4)
    .map((index) => ({ x: stars.x[index]!, y: stars.y[index]!, z: stars.z[index]! }));
};

describe('aimAt', () => {
  // On the sand, with the sea and the launch sites ahead to +z, and on a jetty past them, with
  // the sea behind: the photo turns round to the show either way.
  const EYES = [
    { x: 350, y: 12, z: 600 },
    { x: 150, y: 8, z: 1000 },
  ];

  const shareInFrame = (still: NonNullable<ReturnType<typeof stillFor>>, eye: (typeof EYES)[0]) => {
    const aim = aimAt(still, eye)!;
    const half = (aim.fov / 2) * DEGREE;
    const across = Math.atan(Math.tan(half) * 1.5);
    const stars = brightStars(still);
    const inFrame = stars.filter((star) => {
      const dx = star.x - eye.x;
      const dz = star.z - eye.z;
      const turn = Math.atan2(dx, dz) - aim.heading;
      const up = Math.atan2(star.y - eye.y, Math.hypot(dx, dz)) - aim.tilt;
      return Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) <= across && Math.abs(up) <= half;
    });
    return inFrame.length / stars.length;
  };

  it('frames the busiest part of the show, from the beach or from out on a jetty', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const still = stillFor(SITES, seed)!;
      for (const eye of EYES) {
        const aim = aimAt(still, eye)!;
        expect(aim.fov).toBeGreaterThanOrEqual(35);
        expect(aim.fov).toBeLessThanOrEqual(60);
        expect(shareInFrame(still, eye), `seed ${seed}`).toBeGreaterThan(0.4);
      }
    }
  });

  it('keeps the horizon in the frame when the bursts fit above it', () => {
    const still = stillFor(SITES, 3)!;
    const far = { x: 350, y: 12, z: -2_000 };
    const aim = aimAt(still, far)!;
    expect(aim.tilt).toBeLessThan((aim.fov / 2) * DEGREE);
    expect(shareInFrame(still, far), 'the whole show fits from far off').toBeGreaterThan(0.95);
    expect(Math.cos(aim.heading), 'faces the show, out to sea').toBeGreaterThan(0.9);
  });
});
