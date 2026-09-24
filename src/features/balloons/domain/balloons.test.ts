import { describe, expect, it } from 'vitest';
import { SUNSET_TIME } from '../../lighting/domain/dayNight';
import {
  createBalloons,
  FLIGHT_SECONDS,
  flyingCount,
  poseOf,
  releaseStrength,
  stepBalloons,
  type ReleaseSite,
} from './balloons';

const SITES: ReleaseSite[] = [
  { x: 100, y: 0, z: 400 },
  { x: 140, y: 0, z: 420 },
  { x: 180, y: 0, z: 380 },
];

const balloonsOf = (count = 12, seed = 7) =>
  createBalloons({ sites: SITES, count, variants: 3, seed });

function run(
  balloons: ReturnType<typeof balloonsOf>,
  seconds: number,
  readiness: number,
  step = 0.1,
): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    stepBalloons(balloons, step, readiness, SITES);
  }
}

describe('releaseStrength', () => {
  it('lets nothing go in broad daylight', () => {
    for (const time of [0.1, 0.3, 0.5, 0.62, 0.75, SUNSET_TIME - 0.05]) {
      expect(releaseStrength(time)).toBe(0);
    }
  });

  it('is fully up through the blue hour, just after sunset', () => {
    expect(releaseStrength(SUNSET_TIME + 0.02)).toBeCloseTo(1, 5);
    expect(releaseStrength(SUNSET_TIME + 0.05)).toBeCloseTo(1, 5);
  });

  it('is over before midnight, and does not come back', () => {
    expect(releaseStrength(SUNSET_TIME + 0.09)).toBe(0);
    expect(SUNSET_TIME + 0.09).toBeLessThan(1);
    expect(releaseStrength(0.99)).toBe(0);
    expect(releaseStrength(0)).toBe(0);
  });

  it('reads a clock that has run past midnight', () => {
    const dusk = SUNSET_TIME + 0.03;
    expect(releaseStrength(dusk + 1)).toBeCloseTo(releaseStrength(dusk), 6);
    expect(releaseStrength(dusk - 1)).toBeCloseTo(releaseStrength(dusk), 6);
  });
});

describe('createBalloons', () => {
  it('holds every balloon on the sand to begin with', () => {
    const balloons = balloonsOf();
    expect(balloons.count).toBe(12);
    expect(flyingCount(balloons)).toBe(0);
    for (let index = 0; index < balloons.count; index++) {
      expect(poseOf(balloons, index).scale).toBe(0);
    }
  });

  it('draws every balloon in one of the models it was given', () => {
    const balloons = balloonsOf(40);
    expect([...balloons.variant].every((variant) => variant >= 0 && variant < 3)).toBe(true);
    expect(new Set(balloons.variant).size).toBe(3);
  });

  it('has nothing to let go on a plot with no beach', () => {
    const empty = createBalloons({ sites: [], count: 20, variants: 3, seed: 1 });
    expect(empty.count).toBe(0);
    stepBalloons(empty, 0.1, 1, []);
    expect(flyingCount(empty)).toBe(0);
  });

  it('replays the same sky from the same seed', () => {
    const first = balloonsOf();
    const second = balloonsOf();
    run(first, 200, 1);
    run(second, 200, 1);
    expect([...first.age]).toEqual([...second.age]);
  });
});

describe('stepBalloons', () => {
  it('puts a sky up once the beach is ready', () => {
    const balloons = balloonsOf();
    run(balloons, 120, 1);
    expect(flyingCount(balloons)).toBeGreaterThan(6);
  });

  it('lets none go at all in the middle of the day', () => {
    const balloons = balloonsOf();
    run(balloons, 600, 0);
    expect(flyingCount(balloons)).toBe(0);
  });

  it('puts fewer up when the beach is barely ready', () => {
    const busy = balloonsOf(40, 3);
    const quiet = balloonsOf(40, 3);
    run(busy, 400, 1);
    run(quiet, 400, 0.08);
    expect(flyingCount(quiet)).toBeLessThan(flyingCount(busy));
  });

  it('lets a flight already begun finish after the ritual is over', () => {
    const balloons = balloonsOf();
    run(balloons, 120, 1);
    const flying = flyingCount(balloons);
    expect(flying).toBeGreaterThan(0);
    stepBalloons(balloons, 0.1, 0, SITES);
    expect(flyingCount(balloons)).toBe(flying);
  });

  it('ignores a frame longer than a whole flight', () => {
    // The field clamps the step; this pins that the domain lands everything rather than losing it.
    const balloons = balloonsOf();
    run(balloons, 120, 1);
    stepBalloons(balloons, FLIGHT_SECONDS * 2, 1, SITES);
    expect(flyingCount(balloons)).toBe(0);
    expect([...balloons.age].every((age) => age < 0)).toBe(true);
  });
});

describe('poseOf', () => {
  it('climbs, drifts and grows over a flight', () => {
    const balloons = balloonsOf();
    run(balloons, 120, 1);
    const flier = [...balloons.age].findIndex((age) => age > 1 && age < FLIGHT_SECONDS * 0.4);
    expect(flier).toBeGreaterThanOrEqual(0);

    const before = poseOf(balloons, flier);
    stepBalloons(balloons, 1, 1, SITES);
    const after = poseOf(balloons, flier);
    expect(after.y).toBeGreaterThan(before.y);
    expect(after.x === before.x && after.z === before.z).toBe(false);
    expect(after.scale).toBeGreaterThan(0);
    expect(after.scale).toBeLessThanOrEqual(1);
  });

  it('starts from the sand it was let go on', () => {
    const balloons = balloonsOf();
    run(balloons, 120, 1);
    for (let index = 0; index < balloons.count; index++) {
      if (balloons.age[index]! < 0) continue;
      expect(SITES.some((site) => site.x === balloons.fromX[index])).toBe(true);
      expect(poseOf(balloons, index).y).toBeGreaterThanOrEqual(0);
    }
  });

  it('is scaled to nothing at both ends, so nothing pops in or out', () => {
    const balloons = balloonsOf();
    run(balloons, 120, 1);
    const index = [...balloons.age].findIndex((age) => age >= 0);
    balloons.age[index] = 0;
    expect(poseOf(balloons, index).scale).toBe(0);
    balloons.age[index] = FLIGHT_SECONDS - 0.001;
    expect(poseOf(balloons, index).scale).toBeLessThan(0.01);
    balloons.age[index] = FLIGHT_SECONDS / 2;
    expect(poseOf(balloons, index).scale).toBe(1);
  });
});
