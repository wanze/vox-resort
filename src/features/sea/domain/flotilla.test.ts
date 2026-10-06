import { describe, expect, it } from 'vitest';
import { WALK_SPEED } from '../../crowd/domain/crowd';
import { WALK_VOXELS_PER_SIM_HOUR } from '../../sim/domain/crowdRate';
import { createFlotilla, poseOf, stepFlotilla, type Flotilla } from './flotilla';
import type { PierBox } from './piers';
import type { Mooring, Rental, SailingGround } from './swimArea';

const MOORINGS: Mooring[] = [
  { x: 40, z: 520 },
  { x: 104, z: 528 },
  { x: 168, z: 520 },
];

const GROUND: SailingGround = {
  westX: 0,
  eastX: 400,
  seawardZ: 700,
  landwardZ: (x) => 560 + Math.sin(x / 90) * 24,
};

const WATERLINE = 0.1;

const RENTAL: Rental = { x: 120, z: 500 };

const PEDALO_PACE = 0.6 * WALK_SPEED;

const PEDALOS = { rental: RENTAL, variant: 3, count: 6, pace: PEDALO_PACE };

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

const hiring = (hire = 4, craft = 4, seed = 11): Flotilla =>
  createFlotilla({
    moorings: MOORINGS,
    buoyVariant: 0,
    craft,
    craftVariants: [1, 2],
    fleets: [{ rental: RENTAL, variant: 3, count: hire, pace: PEDALO_PACE }],
    ground: GROUND,
    waterline: WATERLINE,
    seed,
  });

const hireSlots = (flotilla: Flotilla): number[] =>
  Array.from({ length: flotilla.count }, (_, index) => index).filter(
    (index) => flotilla.hired[index] === 1,
  );

function run(flotilla: Flotilla, seconds: number, step = 0.05): void {
  // Counted rather than accumulated, so runs at different frame rates cover the same span.
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

describe('an island in the bay', () => {
  const ISLAND = { minX: 150, maxX: 250, minZ: 600, maxZ: 660 };

  const isled = (): Flotilla =>
    createFlotilla({
      moorings: [],
      buoyVariant: 0,
      craft: 24,
      craftVariants: [1, 2],
      ground: GROUND,
      islands: [ISLAND],
      waterline: WATERLINE,
      seed: 5,
    });

  const aground = (flotilla: Flotilla): number[] =>
    Array.from({ length: flotilla.count }, (_, index) => index).filter((index) => {
      const x = flotilla.x[index]!;
      const z = flotilla.z[index]!;
      return x > ISLAND.minX && x < ISLAND.maxX && z > ISLAND.minZ && z < ISLAND.maxZ;
    });

  it('launches no craft on it', () => {
    expect(aground(isled())).toEqual([]);
  });

  it('keeps every craft off it, however long they sail', () => {
    const flotilla = isled();
    for (let second = 0; second < 300; second++) {
      run(flotilla, 1);
      expect(aground(flotilla)).toEqual([]);
    }
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
  const PIER = { minX: 184, maxX: 200, minZ: 480, maxZ: 620 };
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
    run(flotilla, 5);
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
      // Stored as a 32-bit float, which can round a hair landward of the 64-bit limit.
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
    for (let index = 0; index < MOORINGS.length; index++) expect(flotilla.hired[index]).toBe(0);
  });

  it('lays the berths in a row across the hut, in the water in front of it', () => {
    const flotilla = hiring(4, 0);
    const hire = hireSlots(flotilla);
    const columns = hire.map((index) => flotilla.berthX[index]!);
    expect((Math.min(...columns) + Math.max(...columns)) / 2).toBeCloseTo(RENTAL.x, 5);
    const steps = new Set(columns.slice(1).map((x, index) => Math.round(x - columns[index]!)));
    expect(steps.size).toBe(1);
    for (const index of hire) {
      expect(flotilla.berthZ[index]).toBeGreaterThan(GROUND.landwardZ(flotilla.berthX[index]!));
      expect(Math.abs(flotilla.berthHeading[index]!)).toBeGreaterThan(Math.PI / 2);
    }
  });

  it('hires nothing out on a bay with no hut', () => {
    expect(hireSlots(bay(6))).toEqual([]);
  });

  it('opens with some out and some tied up, rather than the whole rack leaving at once', () => {
    const flotilla = hiring(8, 0, 2);
    const ages = hireSlots(flotilla).map((index) => flotilla.age[index]!);
    expect(ages.some((age) => age < 0)).toBe(true);
    expect(ages.some((age) => age >= 0)).toBe(true);
    expect(new Set(ages).size).toBe(ages.length);
  });
});

describe('the hire step', () => {
  it('keeps the pedalos to the step and the cap they have always had', () => {
    const flotilla = hiring(6, 0);
    expect(flotilla.hireStep).toBe(0.25);
    expect(flotilla.hireSteps).toBe(16);
  });

  it('gives a faster fleet shorter steps, and more of them, all under a voxel at its pace', () => {
    const pace = 2.6 * WALK_SPEED;
    const flotilla = createFlotilla({
      moorings: [],
      buoyVariant: 0,
      craft: 0,
      craftVariants: [1],
      fleets: [PEDALOS, { rental: { x: 280, z: 500 }, variant: 4, count: 4, pace }],
      ground: GROUND,
      waterline: WATERLINE,
      seed: 3,
    });
    expect(flotilla.hireStep * pace).toBeLessThan(1);
    expect(flotilla.hireSteps).toBeGreaterThan(16);
    expect(flotilla.hireSteps).toBeLessThanOrEqual(64);
  });
});

describe('a hire boat’s round trip', () => {
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

  // Two whole hires and the gaps between them, wherever in its cycle each boat was dealt.
  it('takes every boat out and brings every one of them home again', () => {
    for (const trip of trips(hiring(6, 0, 5), 900)) {
      expect(trip.away).toBeGreaterThan(60);
      expect(trip.ties).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps its boats in sight of the hut rather than letting them cross the bay', () => {
    const wide: SailingGround = { ...GROUND, westX: -1500, eastX: 1500, seawardZ: 1500 };
    const flotilla = createFlotilla({
      moorings: [],
      buoyVariant: 0,
      craft: 0,
      craftVariants: [1],
      fleets: [PEDALOS],
      ground: wide,
      waterline: WATERLINE,
      seed: 5,
    });
    let away = 0;
    for (let tick = 0; tick < 20_000; tick++) {
      stepFlotilla(flotilla, 0.1, wide);
      for (const index of hireSlots(flotilla)) {
        away = Math.max(
          away,
          Math.hypot(
            flotilla.x[index]! - flotilla.berthX[index]!,
            flotilla.z[index]! - flotilla.berthZ[index]!,
          ),
        );
      }
    }
    expect(away).toBeGreaterThan(300);
    expect(away).toBeLessThan(520);
  });

  it('keeps the crowd’s time: still while it stands still, the rest of the bay sailing on', () => {
    const flotilla = hiring(6, 4, 7);
    const from = [...flotilla.x];
    const ages = [...flotilla.age];
    for (let tick = 0; tick < 100; tick++) stepFlotilla(flotilla, 0.1, GROUND, 0);
    for (const index of hireSlots(flotilla)) {
      expect(flotilla.x[index]).toBe(from[index]);
      expect(flotilla.age[index]).toBe(ages[index]);
    }
    const craft = MOORINGS.length;
    expect(flotilla.x[craft]).not.toBe(from[craft]);
  });

  it('still comes home on the long steps of a fast resort', () => {
    const flotilla = hiring(6, 0, 5);
    const ties = hireSlots(flotilla).map(() => 0);
    const tied = hireSlots(flotilla).map((index) => flotilla.age[index]! < 0);
    for (let tick = 0; tick < 2000; tick++) {
      stepFlotilla(flotilla, 0.1, GROUND, 3.2);
      for (const [boat, index] of hireSlots(flotilla).entries()) {
        const lying = flotilla.age[index]! < 0;
        if (lying && !tied[boat]) ties[boat]!++;
        tied[boat] = lying;
      }
    }
    for (const count of ties) expect(count).toBeGreaterThanOrEqual(2);
  });

  it('lies still at the berth once it is home, and then goes out again', () => {
    const flotilla = hiring(1, 0, 9);
    const [boat] = hireSlots(flotilla);
    const seen = new Set<string>();
    for (let tick = 0; tick < 6000; tick++) {
      stepFlotilla(flotilla, 0.1, GROUND);
      const age = flotilla.age[boat!]!;
      if (age < 0) {
        expect(flotilla.x[boat!]).toBe(flotilla.berthX[boat!]);
        expect(flotilla.z[boat!]).toBe(flotilla.berthZ[boat!]);
        expect(flotilla.heading[boat!]).toBe(flotilla.berthHeading[boat!]);
        seen.add('tied');
      } else if (age < 100) seen.add('out');
      else seen.add('home');
    }
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

describe('a hire allowance', () => {
  const allowed = (hireAllowed: number, seed = 5): Flotilla =>
    createFlotilla({
      moorings: MOORINGS,
      buoyVariant: 0,
      craft: 0,
      craftVariants: [1, 2],
      fleets: [PEDALOS],
      hireAllowed: [hireAllowed],
      ground: GROUND,
      waterline: WATERLINE,
      seed,
    });

  const out = (flotilla: Flotilla): number =>
    hireSlots(flotilla).filter((index) => flotilla.age[index]! >= 0).length;

  it('keeps every hire boat tied up while nobody is at the hut', () => {
    const flotilla = allowed(0);
    expect(out(flotilla)).toBe(0);
    for (let second = 0; second < 300; second++) {
      run(flotilla, 1);
      expect(out(flotilla)).toBe(0);
    }
  });

  it('launches as many as it is raised to, and no more', () => {
    const flotilla = allowed(0);
    run(flotilla, 60);
    flotilla.hireAllowed[0] = 2;
    stepFlotilla(flotilla, 0.05, GROUND);
    expect(out(flotilla)).toBe(2);
    run(flotilla, 30);
    expect(out(flotilla)).toBe(2);
  });

  it('never calls a boat back early when it is lowered', () => {
    const flotilla = allowed(6);
    run(flotilla, 60);
    const boats = hireSlots(flotilla).filter((index) => flotilla.age[index]! >= 0);
    const ages = boats.map((index) => flotilla.age[index]!);
    expect(ages.some((age) => age < 100)).toBe(true);
    flotilla.hireAllowed[0] = 0;
    run(flotilla, 10);
    for (const [boat, index] of boats.entries()) {
      if (ages[boat]! < 100) expect(flotilla.age[index]).toBeGreaterThan(ages[boat]!);
    }
  });

  it('changes nothing when every boat is allowed out', () => {
    const plain = hiring(6, 4, 7);
    const full = createFlotilla({
      moorings: MOORINGS,
      buoyVariant: 0,
      craft: 4,
      craftVariants: [1, 2],
      fleets: [PEDALOS],
      hireAllowed: [6],
      ground: GROUND,
      waterline: WATERLINE,
      seed: 7,
    });
    run(plain, 60);
    run(full, 60);
    expect([...full.x]).toEqual([...plain.x]);
    expect([...full.age]).toEqual([...plain.age]);
  });
});

const column = (minX: number, maxZ: number): PierBox => ({
  minX,
  maxX: minX + 16,
  minZ: 480,
  maxZ,
});

describe('a hire boat and the piers in its way', () => {
  const REACH = 10;

  const blocked = (piers: PierBox[], islands: PierBox[] = [], seed = 1): Flotilla =>
    createFlotilla({
      moorings: [],
      buoyVariant: 0,
      craft: 0,
      craftVariants: [1],
      fleets: [PEDALOS],
      ground: GROUND,
      radii: [8, 8, 8, REACH],
      piers,
      islands,
      waterline: WATERLINE,
      seed,
    });

  const fewestTies = (flotilla: Flotilla, seconds: number): number => {
    const slots = hireSlots(flotilla);
    const ties = slots.map(() => 0);
    const tied = slots.map((index) => flotilla.age[index]! < 0);
    for (let tick = 0; tick < seconds * 10; tick++) {
      stepFlotilla(flotilla, 0.1, GROUND);
      for (const [boat, index] of slots.entries()) {
        const lying = flotilla.age[index]! < 0;
        if (lying && !tied[boat]) ties[boat]!++;
        tied[boat] = lying;
      }
    }
    return Math.min(...ties);
  };

  it('brings every boat home round the seaward end of a pier between it and its berth', () => {
    const layouts = [
      [column(184, 620)],
      [column(56, 900)],
      [column(184, 900), column(200, 900)],
      [column(40, 800), column(200, 800)],
    ];
    for (const piers of layouts) {
      for (const seed of [1, 2, 3]) {
        expect(fewestTies(blocked(piers, [], seed), 2000), `seed ${seed}`).toBeGreaterThanOrEqual(
          3,
        );
      }
    }
  });

  it('brings every boat home round an island lying off the hut', () => {
    const island = { minX: 20, maxX: 260, minZ: 620, maxZ: 660 };
    expect(fewestTies(blocked([], [island]), 2000)).toBeGreaterThanOrEqual(3);
  });

  it('berths the boats clear of a pier built across the hut’s front', () => {
    const piers = [column(112, 900), column(128, 900)];
    const flotilla = blocked(piers);
    const columns = hireSlots(flotilla).map((index) => flotilla.berthX[index]!);
    expect(columns).toHaveLength(6);
    for (const x of columns) expect(x < 112 - REACH || x > 144 + REACH, `berth at ${x}`).toBe(true);
    expect(fewestTies(flotilla, 2000)).toBeGreaterThanOrEqual(3);
  });

  it('ties a boat up at last when nothing can reach its berth, rather than keeping it out all night', () => {
    const walled = { minX: 0, maxX: 400, minZ: 520, maxZ: 620 };
    expect(fewestTies(blocked([], [walled]), 3000)).toBeGreaterThanOrEqual(2);
  });
});

describe('a towed craft', () => {
  const TUG = 5;
  const TOW = 6;
  const RADII = [8, 8, 8, 6, 5, 9, 10];
  const ROPE = 14;
  const OPEN: SailingGround = { ...GROUND, westX: -1500, eastX: 1500, seawardZ: 1500 };
  const HIRE_SECONDS = (2 * WALK_VOXELS_PER_SIM_HOUR) / WALK_SPEED;

  const towing = (seed = 4, ground = OPEN): Flotilla =>
    createFlotilla({
      moorings: [],
      buoyVariant: 0,
      craft: 0,
      craftVariants: [1],
      fleets: [{ rental: RENTAL, variant: TUG, count: 1, pace: 2.2 * WALK_SPEED, tows: TOW }],
      ground,
      radii: RADII,
      waterline: WATERLINE,
      seed,
    });

  const rope = (flotilla: Flotilla): number => {
    const heading = flotilla.heading[0]!;
    const hitchX = flotilla.x[0]! - Math.sin(heading) * RADII[TUG]!;
    const hitchZ = flotilla.z[0]! - Math.cos(heading) * RADII[TUG]!;
    return Math.hypot(flotilla.x[1]! - hitchX, flotilla.z[1]! - hitchZ) - RADII[TOW]!;
  };

  it('follows its tug on a rope that stays the length it is', () => {
    for (const seed of [1, 2, 4]) {
      const flotilla = towing(seed);
      expect([...flotilla.variant]).toEqual([TUG, TOW]);
      expect(flotilla.towedBy[1]).toBe(0);
      let out = 0;
      for (let tick = 0; tick < 6000; tick++) {
        stepFlotilla(flotilla, 0.1, OPEN);
        if (flotilla.age[0]! < 0) continue;
        out++;
        expect(Math.abs(rope(flotilla) - ROPE), `seed ${seed}`).toBeLessThanOrEqual(0.5);
      }
      expect(out).toBeGreaterThan(1000);
    }
  });

  it('swings inside its tug’s turning circle once round', () => {
    const flotilla = towing();
    const centre = { x: 200, z: 900 };
    const radius = 40;
    const lap = 20;
    flotilla.age[0] = 0;
    flotilla.speed[0] = 0;
    flotilla.turn[0] = 0;
    let widest = 0;
    for (let tick = 0; tick < (2 * lap) / 0.05; tick++) {
      const angle = (2 * Math.PI * tick * 0.05) / lap;
      flotilla.x[0] = centre.x + radius * Math.sin(angle);
      flotilla.z[0] = centre.z + radius * Math.cos(angle);
      flotilla.heading[0] = Math.atan2(Math.cos(angle), -Math.sin(angle));
      stepFlotilla(flotilla, 0.05, OPEN);
      if (tick * 0.05 < lap) continue;
      widest = Math.max(widest, Math.hypot(flotilla.x[1]! - centre.x, flotilla.z[1]! - centre.z));
    }
    expect(widest).toBeGreaterThan(0);
    expect(widest).toBeLessThan(radius);
  });

  it('comes home tied up behind its tug once nobody is at the hut', () => {
    const seed = [1, 2, 3, 4, 5, 6].find((each) => towing(each, GROUND).age[0]! >= 0)!;
    const flotilla = towing(seed, GROUND);
    flotilla.hireAllowed[0] = 0;
    const walkHome = 480 / (2.2 * WALK_SPEED * 0.55);
    let tied = false;
    for (let tick = 0; tick < (HIRE_SECONDS + walkHome) / 0.1 && !tied; tick++) {
      stepFlotilla(flotilla, 0.1, GROUND);
      tied = flotilla.age[0]! < 0;
    }
    expect(tied).toBe(true);
    expect(flotilla.age[1]).toBe(flotilla.age[0]);
    expect(flotilla.x[1]).toBe(flotilla.berthX[1]);
    expect(flotilla.z[1]).toBe(flotilla.berthZ[1]);
    expect(flotilla.berthZ[1]).toBeGreaterThan(flotilla.berthZ[0]!);
    run(flotilla, 60);
    expect(flotilla.age[0]).toBeLessThan(0);
  });
});

describe('a fast hire craft beside a pier', () => {
  const BAY: SailingGround = { ...GROUND, eastX: 600, seawardZ: 900 };
  const HUT: Rental = { x: 300, z: 500 };
  const RADII = [8, 8, 8, 6, 5, 9, 10];
  const FLEETS = [
    { rental: HUT, variant: 3, count: 6, pace: 0.6 * WALK_SPEED },
    { rental: HUT, variant: 4, count: 4, pace: 2.6 * WALK_SPEED },
    { rental: HUT, variant: 5, count: 1, pace: 2.2 * WALK_SPEED, tows: 6 },
  ];

  // Out on a hire rather than homing, which may round a long pier; 6 voxels in 5 s is pinned.
  const longestPinned = (fleet: (typeof FLEETS)[number], pier: PierBox, seed: number): number => {
    const flotilla = createFlotilla({
      moorings: [],
      buoyVariant: 0,
      craft: 0,
      craftVariants: [1],
      fleets: [fleet],
      ground: BAY,
      radii: RADII,
      piers: [pier],
      waterline: WATERLINE,
      seed,
    });
    const tugs = hireSlots(flotilla).filter((index) => flotilla.towedBy[index]! < 0);
    const since = tugs.map(() => 0);
    const fromX = tugs.map((index) => flotilla.x[index]!);
    const fromZ = tugs.map((index) => flotilla.z[index]!);
    let longest = 0;
    for (let tick = 0; tick < 12_000; tick++) {
      stepFlotilla(flotilla, 0.1, BAY);
      for (const [boat, index] of tugs.entries()) {
        const moved = Math.hypot(
          flotilla.x[index]! - fromX[boat]!,
          flotilla.z[index]! - fromZ[boat]!,
        );
        if (flotilla.age[index]! < 0 || flotilla.age[index]! > 260 || moved > 6) {
          since[boat] = 0;
          fromX[boat] = flotilla.x[index]!;
          fromZ[boat] = flotilla.z[index]!;
          continue;
        }
        since[boat]! += 0.1;
        longest = Math.max(longest, since[boat]!);
      }
    }
    return longest;
  };

  it('is never held against it, nor against the shore beside it, for long', () => {
    for (const fleet of FLEETS) {
      for (const pier of [column(200, 700), column(330, 620), column(380, 800)]) {
        for (const seed of [1, 4]) {
          const at = `variant ${fleet.variant}, pier at ${pier.minX}, seed ${seed}`;
          expect(longestPinned(fleet, pier, seed), at).toBeLessThan(20);
        }
      }
    }
  });
});
