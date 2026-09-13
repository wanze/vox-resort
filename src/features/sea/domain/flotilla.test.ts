import { describe, expect, it } from 'vitest';
import { createFlotilla, poseOf, stepFlotilla, type Flotilla } from './flotilla';
import type { Mooring, Rental, SailingGround } from './swimArea';

const MOORINGS: Mooring[] = [
  { x: 40, z: 520 },
  { x: 104, z: 528 },
  { x: 168, z: 520 },
];

/** A bay with a coast that bulges, so the landward limit is never a straight line. */
const GROUND: SailingGround = {
  westX: 0,
  eastX: 400,
  seawardZ: 700,
  landwardZ: (x) => 560 + Math.sin(x / 90) * 24,
};

const WATERLINE = 0.1;

/** The hire hut, standing on the sand behind the bay's western end. */
const RENTAL: Rental = { x: 120, z: 500 };

const bay = (craft = 8, seed = 11): Flotilla =>
  createFlotilla({
    moorings: MOORINGS,
    buoyVariant: 0,
    craft,
    craftVariants: [1, 2],
    ground: GROUND,
    waterline: WATERLINE,
    seed,
  });

/** A bay with a hire trade on it: the same craft, plus the rental's pedalos. */
const hiring = (hire = 4, craft = 4, seed = 11): Flotilla =>
  createFlotilla({
    moorings: MOORINGS,
    buoyVariant: 0,
    craft,
    craftVariants: [1, 2],
    hire: { count: hire, variant: 3, rental: RENTAL },
    ground: GROUND,
    waterline: WATERLINE,
    seed,
  });

/** The indices of the rental's own boats, which come last. */
const hireSlots = (flotilla: Flotilla): number[] =>
  Array.from({ length: flotilla.count }, (_, index) => index).filter(
    (index) => flotilla.hired[index] === 1,
  );

/** Runs the bay forward at a steady frame rate. */
function run(flotilla: Flotilla, seconds: number, step = 0.05): void {
  // Counted rather than accumulated, so two runs at different frame rates cover
  // the same span of seconds and the comparison below is about the code.
  const ticks = Math.round(seconds / step);
  for (let tick = 0; tick < ticks; tick++) stepFlotilla(flotilla, step, GROUND);
}

describe('createFlotilla', () => {
  it('puts one buoy on every mooring, and the craft after them', () => {
    const flotilla = bay();
    expect(flotilla.count).toBe(MOORINGS.length + 8);
    for (const [index, mooring] of MOORINGS.entries()) {
      expect(flotilla.variant[index]).toBe(0);
      expect(flotilla.x[index]).toBe(mooring.x);
      expect(flotilla.z[index]).toBe(mooring.z);
      expect(flotilla.speed[index]).toBe(0);
    }
    for (let index = MOORINGS.length; index < flotilla.count; index++) {
      expect(flotilla.variant[index]).toBeGreaterThan(0);
      expect(flotilla.speed[index]).toBeGreaterThan(0);
    }
  });

  it('draws every craft from the models it was given', () => {
    for (const variant of bay(30).variant.slice(MOORINGS.length)) {
      expect([1, 2]).toContain(variant);
    }
  });

  it('drops every craft in the water it is allowed into', () => {
    const flotilla = bay(40);
    for (let index = MOORINGS.length; index < flotilla.count; index++) {
      const x = flotilla.x[index]!;
      expect(x).toBeGreaterThanOrEqual(GROUND.westX);
      expect(x).toBeLessThanOrEqual(GROUND.eastX);
      expect(flotilla.z[index]).toBeGreaterThanOrEqual(GROUND.landwardZ(x));
      expect(flotilla.z[index]).toBeLessThanOrEqual(GROUND.seawardZ);
    }
  });

  it('is the same bay from the same seed, and a different one otherwise', () => {
    expect([...bay(8, 4).x]).toEqual([...bay(8, 4).x]);
    expect([...bay(8, 4).x]).not.toEqual([...bay(8, 5).x]);
  });

  it('floats nothing at all with no moorings and no models to draw a craft in', () => {
    const empty = createFlotilla({
      moorings: [],
      buoyVariant: 0,
      craft: 12,
      craftVariants: [],
      ground: GROUND,
      waterline: WATERLINE,
      seed: 1,
    });
    expect(empty.count).toBe(0);
  });
});

describe('stepFlotilla', () => {
  it('leaves a moored buoy exactly where it was moored', () => {
    const flotilla = bay();
    run(flotilla, 120);
    for (const [index, mooring] of MOORINGS.entries()) {
      expect(flotilla.x[index]).toBe(mooring.x);
      expect(flotilla.z[index]).toBe(mooring.z);
    }
  });

  it('keeps every craft inside the bay, however long it runs', () => {
    const flotilla = bay(24);
    run(flotilla, 600);
    for (let index = MOORINGS.length; index < flotilla.count; index++) {
      const x = flotilla.x[index]!;
      expect(x).toBeGreaterThanOrEqual(GROUND.westX);
      expect(x).toBeLessThanOrEqual(GROUND.eastX);
      // The landward limit is the line of buoys, so this is also the check that
      // nothing is sailing through the swimming area.
      expect(flotilla.z[index]).toBeGreaterThanOrEqual(GROUND.landwardZ(x));
      expect(flotilla.z[index]).toBeLessThanOrEqual(GROUND.seawardZ);
    }
  });

  it('actually moves the craft rather than leaving them where they started', () => {
    const flotilla = bay();
    const from = [...flotilla.x];
    run(flotilla, 30);
    for (let index = MOORINGS.length; index < flotilla.count; index++) {
      expect(Math.abs(flotilla.x[index]! - from[index]!)).toBeGreaterThan(1);
    }
  });

  it('turns a craft rather than letting it hold one heading forever', () => {
    const flotilla = bay(1);
    const from = flotilla.heading[MOORINGS.length]!;
    run(flotilla, 60);
    expect(flotilla.heading[MOORINGS.length]).not.toBe(from);
  });

  it('keeps a heading inside one turn of the circle', () => {
    const flotilla = bay(12);
    run(flotilla, 900);
    for (const heading of flotilla.heading) expect(Math.abs(heading)).toBeLessThanOrEqual(Math.PI);
  });
});

describe('steering round things', () => {
  /** A pier out from the coast, reaching well past the landward limit. */
  const PIER = { minX: 184, maxX: 200, minZ: 480, maxZ: 620 };
  /** Buoys, rowing boats and sailing boats, at roughly their real sizes. */
  const RADII = [1.5, 8, 10];

  const crowded = (craft: number, seed: number): Flotilla =>
    createFlotilla({
      moorings: MOORINGS,
      buoyVariant: 0,
      craft,
      craftVariants: [1, 2],
      ground: GROUND,
      radii: RADII,
      piers: [PIER],
      waterline: WATERLINE,
      seed,
    });

  it('takes each craft’s reach from the model it is drawn in', () => {
    const flotilla = crowded(10, 1);
    for (let index = 0; index < flotilla.count; index++) {
      expect(flotilla.radius[index]).toBe(RADII[flotilla.variant[index]!]);
    }
    expect(bay().radius[MOORINGS.length], 'a model nobody measured').toBeGreaterThan(0);
  });

  it('never sails a craft into a pier', () => {
    const flotilla = crowded(30, 2);
    for (let tick = 0; tick < 6000; tick++) {
      stepFlotilla(flotilla, 0.1, GROUND);
      for (let index = MOORINGS.length; index < flotilla.count; index++) {
        const reach = flotilla.radius[index]! - 0.5;
        const x = flotilla.x[index]!;
        const z = flotilla.z[index]!;
        const inside =
          x > PIER.minX - reach &&
          x < PIER.maxX + reach &&
          z > PIER.minZ - reach &&
          z < PIER.maxZ + reach;
        expect(inside, `craft ${index} in the pier at tick ${tick}`).toBe(false);
      }
    }
  });

  it('keeps craft off the buoys and off each other', () => {
    const flotilla = crowded(30, 3);
    // A few seconds to sort out craft that were dropped on top of each other.
    run(flotilla, 5);
    // The worst overlap over the run, as a share of how far apart the two should
    // be: asserted once, because 6 000 ticks of every pair is a lot of expects.
    let worst = Infinity;
    for (let tick = 0; tick < 6000; tick++) {
      stepFlotilla(flotilla, 0.1, GROUND);
      for (let one = MOORINGS.length; one < flotilla.count; one++) {
        for (let other = 0; other < one; other++) {
          const apart = Math.hypot(
            flotilla.x[one]! - flotilla.x[other]!,
            flotilla.z[one]! - flotilla.z[other]!,
          );
          worst = Math.min(worst, apart / (flotilla.radius[one]! + flotilla.radius[other]!));
        }
      }
    }
    expect(worst).toBeGreaterThan(0.8);
  });

  it('still keeps them inside the bay while it does', () => {
    const flotilla = crowded(30, 4);
    run(flotilla, 600);
    for (let index = MOORINGS.length; index < flotilla.count; index++) {
      const x = flotilla.x[index]!;
      expect(x).toBeGreaterThanOrEqual(GROUND.westX);
      expect(x).toBeLessThanOrEqual(GROUND.eastX);
      // A craft clamped onto the limit is stored as a 32-bit float, which can
      // round it a hair to landward of the 64-bit limit it was clamped to.
      expect(flotilla.z[index]).toBeGreaterThanOrEqual(GROUND.landwardZ(x) - 1e-3);
      expect(flotilla.z[index]).toBeLessThanOrEqual(GROUND.seawardZ);
    }
  });

  it('is the same bay from the same seed, obstacles and all', () => {
    const one = crowded(20, 5);
    const other = crowded(20, 5);
    run(one, 120);
    run(other, 120);
    expect([...one.x]).toEqual([...other.x]);
  });
});

describe('poseOf', () => {
  it('rides the swell: heaving about the waterline, heeling and pitching', () => {
    const flotilla = bay();
    const heights = new Set<number>();
    const rolls = new Set<number>();
    for (let tick = 0; tick < 40; tick++) {
      stepFlotilla(flotilla, 0.1, GROUND);
      const pose = poseOf(flotilla, 0);
      heights.add(pose.y);
      rolls.add(pose.roll);
      expect(Math.abs(pose.y - WATERLINE)).toBeLessThan(1);
      expect(Math.abs(pose.roll)).toBeLessThan(0.1);
      expect(Math.abs(pose.pitch)).toBeLessThan(0.1);
    }
    expect(heights.size).toBeGreaterThan(20);
    expect(rolls.size).toBeGreaterThan(20);
  });

  it('gives no two of them the same attitude', () => {
    const flotilla = bay();
    stepFlotilla(flotilla, 0.1, GROUND);
    const heights = new Set(
      Array.from({ length: flotilla.count }, (_, index) => poseOf(flotilla, index).y),
    );
    expect(heights.size).toBe(flotilla.count);
  });

  it('is the same swell at any frame rate', () => {
    // Read off an accumulated clock rather than integrated, so a slow machine
    // and a fast one see the same water.
    const coarse = bay();
    const fine = bay();
    run(coarse, 6, 0.1);
    run(fine, 6, 0.02);
    expect(poseOf(coarse, 0).y).toBeCloseTo(poseOf(fine, 0).y, 5);
  });

  it('points a craft the way it is heading', () => {
    const flotilla = bay(1);
    run(flotilla, 12);
    const craft = MOORINGS.length;
    expect(poseOf(flotilla, craft).heading).toBe(flotilla.heading[craft]);
  });
});

describe('the rental’s own boats', () => {
  it('adds one hire boat per berth, drawn in the model the hut lets out', () => {
    const flotilla = hiring(4, 4);
    expect(flotilla.count).toBe(MOORINGS.length + 4 + 4);
    const hire = hireSlots(flotilla);
    expect(hire).toHaveLength(4);
    for (const index of hire) expect(flotilla.variant[index]).toBe(3);
    // Nothing the rental does not own goes home.
    for (let index = 0; index < MOORINGS.length; index++) expect(flotilla.hired[index]).toBe(0);
  });

  it('lays the berths in a row across the hut, in the water in front of it', () => {
    const flotilla = hiring(4, 0);
    const hire = hireSlots(flotilla);
    const columns = hire.map((index) => flotilla.berthX[index]!);
    // Centred on the hut and evenly spaced.
    expect((Math.min(...columns) + Math.max(...columns)) / 2).toBeCloseTo(RENTAL.x, 5);
    const steps = new Set(columns.slice(1).map((x, index) => Math.round(x - columns[index]!)));
    expect(steps.size).toBe(1);
    for (const index of hire) {
      // Seaward of the limit at its own column, so a moored boat is legally afloat.
      expect(flotilla.berthZ[index]).toBeGreaterThan(GROUND.landwardZ(flotilla.berthX[index]!));
      // And lying bow to the hut, which is bow to the beach.
      expect(Math.abs(flotilla.berthHeading[index]!)).toBeGreaterThan(Math.PI / 2);
    }
  });

  it('hires nothing out on a bay with no hut', () => {
    expect(hireSlots(bay(6))).toEqual([]);
  });

  it('opens with some out and some tied up, rather than the whole rack leaving at once', () => {
    const flotilla = hiring(8, 0, 3);
    const ages = hireSlots(flotilla).map((index) => flotilla.age[index]!);
    expect(ages.some((age) => age < 0)).toBe(true);
    expect(ages.some((age) => age >= 0)).toBe(true);
    expect(new Set(ages).size).toBe(ages.length);
  });
});

describe('a hire boat’s round trip', () => {
  /** Runs the bay and reports, per hire boat, how far out it got and whether it tied up. */
  const trips = (
    flotilla: Flotilla,
    seconds: number,
    step = 0.1,
  ): { readonly away: number; readonly ties: number }[] => {
    const slots = hireSlots(flotilla);
    const away = slots.map(() => 0);
    const ties = slots.map(() => 0);
    const tied = slots.map(() => false);
    const ticks = Math.round(seconds / step);
    for (let tick = 0; tick < ticks; tick++) {
      stepFlotilla(flotilla, step, GROUND);
      for (const [boat, index] of slots.entries()) {
        away[boat] = Math.max(
          away[boat]!,
          Math.hypot(
            flotilla.x[index]! - flotilla.berthX[index]!,
            flotilla.z[index]! - flotilla.berthZ[index]!,
          ),
        );
        const lying = flotilla.age[index]! < 0;
        if (lying && !tied[boat]!) ties[boat]!++;
        tied[boat] = lying;
      }
    }
    return slots.map((_, boat) => ({ away: away[boat]!, ties: ties[boat]! }));
  };

  it('takes every boat out and brings every one of them home again', () => {
    for (const trip of trips(hiring(6, 0, 5), 600)) {
      // Out: it gets well clear of the hut.
      expect(trip.away).toBeGreaterThan(60);
      // And home: it lay at its berth at the end of a hire, more than once.
      expect(trip.ties).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps its boats in sight of the hut rather than letting them cross the bay', () => {
    // The reach is what makes a rental read as a rental: a cluster of pedalos
    // off the hire beach, not six boats scattered over a kilometre of water.
    for (const trip of trips(hiring(6, 0, 5), 900)) {
      expect(trip.away).toBeLessThan(220);
    }
  });

  it('lies still at the berth once it is home, and then goes out again', () => {
    const flotilla = hiring(1, 0, 9);
    const [boat] = hireSlots(flotilla);
    const seen = new Set<string>();
    for (let tick = 0; tick < 6000; tick++) {
      stepFlotilla(flotilla, 0.1, GROUND);
      const age = flotilla.age[boat!]!;
      if (age < 0) {
        // Tied up: exactly on its berth, and not drifting off it.
        expect(flotilla.x[boat!]).toBe(flotilla.berthX[boat!]);
        expect(flotilla.z[boat!]).toBe(flotilla.berthZ[boat!]);
        expect(flotilla.heading[boat!]).toBe(flotilla.berthHeading[boat!]);
        seen.add('tied');
      } else if (age < 100) seen.add('out');
      else seen.add('home');
    }
    // The whole cycle, more than once over ten minutes.
    expect([...seen].toSorted()).toEqual(['home', 'out', 'tied']);
  });

  it('keeps a hire boat inside the bay the whole way round', () => {
    const flotilla = hiring(6, 0, 2);
    for (let tick = 0; tick < 6000; tick++) {
      stepFlotilla(flotilla, 0.1, GROUND);
      for (const index of hireSlots(flotilla)) {
        const x = flotilla.x[index]!;
        expect(x).toBeGreaterThanOrEqual(GROUND.westX);
        expect(x).toBeLessThanOrEqual(GROUND.eastX);
        expect(flotilla.z[index]).toBeLessThanOrEqual(GROUND.seawardZ);
      }
    }
  });
});
