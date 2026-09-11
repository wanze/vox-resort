import { describe, expect, it } from 'vitest';
import type { VoxelModel } from '../../../../voxel-gen/voxelgen.ts';
import { createFlotilla, poseOf, stepFlotilla, type Flotilla } from './flotilla';
import {
  aboard,
  berthsOf,
  createPassengers,
  poseAboard,
  type Berth,
  type Passengers,
} from './passengers';
import type { Mooring, Rental, SailingGround } from './swimArea';

const MOORINGS: Mooring[] = [
  { x: 40, z: 520 },
  { x: 104, z: 520 },
];

const GROUND: SailingGround = {
  westX: 0,
  eastX: 400,
  seawardZ: 700,
  landwardZ: () => 560,
};

const RENTAL: Rental = { x: 120, z: 500 };
const WATERLINE = 0.5;

/** How far a berth is from the point its own hull's matrix is written at. */
const reach = (
  seat: { x: number; y: number; z: number },
  hull: { x: number; y: number; z: number },
): number => Math.hypot(seat.x - hull.x, seat.y - hull.y, seat.z - hull.z);

/**
 * The registry's berths, as the variants below use them: nothing on the buoy,
 * two on the boat, one on the hire craft.
 */
const BUOY = 0;
const BOAT = 1;
const HIRE = 2;
const BERTHS: readonly (readonly Berth[])[] = [
  [],
  [
    { x: 0, y: 4, z: 2.5, heading: Math.PI },
    { x: 0, y: 5, z: -2.5, heading: 0 },
  ],
  [{ x: -1.5, y: 3, z: -1, heading: 0 }],
];

const bay = (craft = 6, hire = 4, seed = 7): Flotilla =>
  createFlotilla({
    moorings: MOORINGS,
    buoyVariant: BUOY,
    craft,
    craftVariants: [BOAT],
    hire: { count: hire, variant: HIRE, rental: RENTAL },
    ground: GROUND,
    waterline: WATERLINE,
    seed,
  });

const crewFor = (flotilla: Flotilla, seed = 3): Passengers =>
  createPassengers({ flotilla, berths: BERTHS, variants: 4, seed });

/** The berths taken on one craft, as `(x, y, z)` triples in the order filled. */
const takenOn = (passengers: Passengers, craft: number): string[] =>
  Array.from({ length: passengers.count }, (_, index) => index)
    .filter((index) => passengers.craft[index] === craft)
    .map((index) => `${passengers.x[index]},${passengers.y[index]},${passengers.z[index]}`);

/** A sea model as `berthsOf` needs to see it. */
const model = (parts: Partial<VoxelModel>): VoxelModel =>
  ({ id: 'craft', width: 8, height: 6, depth: 12, seats: [], ...parts }) as VoxelModel;

describe('berthsOf', () => {
  it('puts a declared seat on the craft’s own middle and waterline', () => {
    // The hang the field applies to the geometry: half the box across and
    // along, and nothing vertically, because a hull is drawn from its own
    // waterline up. Half a voxel because a person sits in the middle of a
    // column.
    const berths = berthsOf(model({ seats: [{ x: 3, y: 4, z: 10, facing: 0, pose: 'sit' }] }));
    expect(berths).toEqual([{ x: 3.5 - 4, y: 4, z: 10.5 - 6, heading: 0 }]);
  });

  it('reads a seat’s facing as a turn from the bow', () => {
    // Every hull is drawn bow towards +z, so a seat's own quarter turns are
    // already measured from the bow and need nothing done to them.
    const berths = berthsOf(
      model({
        seats: [
          { x: 0, y: 1, z: 0, facing: 0, pose: 'sit' },
          { x: 0, y: 1, z: 1, facing: 2, pose: 'sit' },
        ],
      }),
    );
    expect(berths[0]!.heading).toBeCloseTo(0);
    expect(berths[1]!.heading).toBeCloseTo(Math.PI);
  });

  it('offers no berths on a craft whose art declares no seat', () => {
    expect(berthsOf(model({}))).toEqual([]);
  });
});

describe('createPassengers', () => {
  it('seats nobody on a buoy, which declares no seat', () => {
    const flotilla = bay();
    const passengers = crewFor(flotilla);
    for (let index = 0; index < passengers.count; index++) {
      expect(flotilla.variant[passengers.craft[index]!]).not.toBe(BUOY);
    }
  });

  it('puts somebody on every boat the rental has out', () => {
    const flotilla = bay();
    const passengers = crewFor(flotilla);
    for (let craft = 0; craft < flotilla.count; craft++) {
      if (flotilla.hired[craft] !== 1) continue;
      expect(takenOn(passengers, craft), `craft ${craft}`).toHaveLength(1);
    }
  });

  it('leaves some of the private boats empty and crews most of them', () => {
    const flotilla = bay(40, 0);
    const passengers = crewFor(flotilla);
    const crewed = new Set(Array.from(passengers.craft));
    // Forty boats at four in five is a fleet that is mostly manned without
    // being uniformly so, which is the whole of what AT_THE_HELM is for.
    expect(crewed.size).toBeGreaterThan(24);
    expect(crewed.size).toBeLessThan(40);
  });

  it('fills a craft’s berths in the order the art declared them', () => {
    // The rule that keeps a passenger out of the stern of a boat nobody is
    // rowing: a crew is always a prefix of the berths.
    const flotilla = bay(60, 0);
    const passengers = crewFor(flotilla);
    const offered = BERTHS[BOAT]!.map((berth) => `${berth.x},${berth.y},${berth.z}`);
    for (let craft = 0; craft < flotilla.count; craft++) {
      const taken = takenOn(passengers, craft);
      if (flotilla.variant[craft] !== BOAT) continue;
      expect(taken, `craft ${craft}`).toEqual(offered.slice(0, taken.length));
    }
  });

  it('seats two in some boats and one in others', () => {
    const flotilla = bay(60, 0);
    const passengers = crewFor(flotilla);
    const sizes = new Set(
      Array.from({ length: flotilla.count }, (_, craft) => takenOn(passengers, craft).length),
    );
    expect(sizes).toEqual(new Set([0, 1, 2]));
  });

  it('draws every passenger in a model the scene can draw', () => {
    const passengers = createPassengers({
      flotilla: bay(),
      berths: BERTHS,
      variants: 2,
      seed: 5,
    });
    expect(passengers.count).toBeGreaterThan(0);
    for (const variant of passengers.variant) {
      expect(variant).toBeGreaterThanOrEqual(0);
      expect(variant).toBeLessThan(2);
    }
  });

  it('seats the same people in the same places on the same seed', () => {
    const flotilla = bay();
    const first = crewFor(flotilla);
    const again = crewFor(flotilla);
    expect(Array.from(again.craft)).toEqual(Array.from(first.craft));
    expect(Array.from(again.variant)).toEqual(Array.from(first.variant));
    expect(Array.from(again.z)).toEqual(Array.from(first.z));
  });

  it('carries nobody on a bay whose craft declare no seats', () => {
    expect(
      createPassengers({ flotilla: bay(), berths: [[], [], []], variants: 4, seed: 3 }).count,
    ).toBe(0);
  });
});

describe('aboard', () => {
  it('keeps a private boat crewed whatever the clock says', () => {
    const flotilla = bay(6, 0);
    const passengers = crewFor(flotilla);
    for (let index = 0; index < passengers.count; index++) {
      expect(aboard(flotilla, passengers, index)).toBe(true);
    }
    for (let tick = 0; tick < 400; tick++) stepFlotilla(flotilla, 0.5, GROUND);
    for (let index = 0; index < passengers.count; index++) {
      expect(aboard(flotilla, passengers, index)).toBe(true);
    }
  });

  it('empties a hire boat while it lies at its berth and fills it when it goes out', () => {
    const flotilla = bay(0, 4);
    const passengers = crewFor(flotilla);
    expect(passengers.count).toBe(4);
    for (let index = 0; index < passengers.count; index++) {
      const craft = passengers.craft[index]!;
      // The whole of the state: the sign of the age the flotilla already keeps.
      expect(aboard(flotilla, passengers, index)).toBe(flotilla.age[craft]! >= 0);
    }
  });

  it('sees a hire boat’s guest come and go over one cycle', () => {
    const flotilla = bay(0, 1);
    const passengers = crewFor(flotilla);
    const seen = new Set<boolean>();
    // Longer than one hire and one turnaround together, so both states happen
    // however the boat was dropped into the cycle.
    for (let tick = 0; tick < 4000; tick++) {
      seen.add(aboard(flotilla, passengers, 0));
      stepFlotilla(flotilla, 0.1, GROUND);
    }
    expect(seen).toEqual(new Set([true, false]));
  });
});

describe('poseAboard', () => {
  /**
   * One craft on a bay, pointing where it is told and riding the swell at the
   * phase it is told.
   *
   * The ride is zeroed rather than left to the seed, which is what makes the
   * attitude arithmetic: at a clock of nought a craft with no ride is exactly
   * level and exactly on the waterline, and a quarter of a period on it is
   * heeled as far as it ever heels.
   */
  const one = (
    berth: Berth,
    parts: { heading?: number; clock?: number } = {},
  ): { flotilla: Flotilla; passengers: Passengers } => {
    const flotilla = createFlotilla({
      moorings: [],
      buoyVariant: BUOY,
      craft: 1,
      craftVariants: [BOAT],
      ground: GROUND,
      waterline: WATERLINE,
      seed: 2,
    });
    flotilla.ride[0] = 0;
    flotilla.clock = parts.clock ?? 0;
    flotilla.heading[0] = parts.heading ?? 0;
    const passengers = createPassengers({
      flotilla,
      berths: [[], [berth], []],
      variants: 1,
      seed: 1,
    });
    return { flotilla, passengers };
  };

  /** A quarter of the roll's period, where the heel is largest. */
  const HEELED = Math.PI / 2 / 0.83;

  it('puts a berth on the keel where the hull itself is, lifted to the seat', () => {
    const berth: Berth = { x: 0, y: 4, z: 0, heading: 0 };
    const { flotilla, passengers } = one(berth);
    const hull = poseOf(flotilla, 0);
    const seat = poseAboard(flotilla, passengers, 0);
    expect(seat.x).toBeCloseTo(hull.x);
    expect(seat.z).toBeCloseTo(hull.z);
    expect(seat.y).toBeCloseTo(hull.y + 4);
  });

  it('carries a berth round with the bow', () => {
    // Two voxels forward of the middle, on a craft pointing due east: forward
    // is +x there, because a hull is drawn bow towards +z and the heading is
    // measured from it.
    const berth: Berth = { x: 0, y: 0, z: 2, heading: 0 };
    const { flotilla, passengers } = one(berth, { heading: Math.PI / 2 });
    const hull = poseOf(flotilla, 0);
    const seat = poseAboard(flotilla, passengers, 0);
    expect(seat.x).toBeCloseTo(hull.x + 2);
    expect(seat.z).toBeCloseTo(hull.z);
  });

  it('adds the berth’s own turn to the bow, so a rower faces astern', () => {
    const berth: Berth = { x: 0, y: 4, z: 2, heading: Math.PI };
    const { flotilla, passengers } = one(berth, { heading: 0.4 });
    const seat = poseAboard(flotilla, passengers, 0);
    expect(seat.heading).toBeCloseTo(0.4 + Math.PI);
    // The heel is still the hull's, measured about the hull's own bow.
    expect(seat.bow).toBeCloseTo(0.4);
  });

  it('heels a berth off the centreline across as well as up', () => {
    // The reason a passenger cannot simply be hung under the hull's own point:
    // a seat three voxels to starboard swings when the boat rolls, and a figure
    // that stayed put would sit beside the boat rather than in it.
    const berth: Berth = { x: 3, y: 0, z: 0, heading: 0 };
    const upright = one(berth);
    const level = poseAboard(upright.flotilla, upright.passengers, 0);
    const hullLevel = poseOf(upright.flotilla, 0);

    const heeled = one(berth, { clock: HEELED });
    const over = poseAboard(heeled.flotilla, heeled.passengers, 0);
    const hullOver = poseOf(heeled.flotilla, 0);

    expect(Math.abs(over.roll)).toBeGreaterThan(Math.abs(level.roll));
    // Both offsets move, and the vertical one by more than the heave alone.
    expect(over.x - hullOver.x).not.toBeCloseTo(level.x - hullLevel.x);
    expect(over.y - hullOver.y).not.toBeCloseTo(level.y - hullLevel.y);
    // And the berth keeps its distance from the hull's own point: a rotation
    // moves a seat, it does not stretch the boat.
    expect(reach(over, hullOver)).toBeCloseTo(reach(level, hullLevel));
  });

  it('rides the craft, so a passenger moves when the bay is stepped', () => {
    const { flotilla, passengers } = one({ x: 1, y: 4, z: 2, heading: 0 });
    const before = poseAboard(flotilla, passengers, 0);
    stepFlotilla(flotilla, 1, GROUND);
    const after = poseAboard(flotilla, passengers, 0);
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(0.5);
  });
});
