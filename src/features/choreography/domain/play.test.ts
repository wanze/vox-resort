import { describe, expect, it, vi } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { objectTypeById } from '../../catalog/domain/objectTypes';
import { RESTING } from '../../crowd/domain/crowd';
import type { Placement } from '../../layout/domain/resortLayout';
import { venuesOn } from '../../sim/domain/venues';
import { perform } from './acts';
import { createCast, recast, type Cast } from './casting';
import { placesFor, type LoopPlace, type SpotActPlace } from './places';

// Drawn only: a seeded draw here would move every replay of the simulation.
vi.mock('../../layout/domain/random', () => {
  const refused = new Error('play drew from a seeded stream');
  const refuse = (): never => {
    throw refused;
  };
  return { createRandom: refuse, resumeRandom: refuse };
});

const placed = (id: string): Placement => {
  const { model } = objectTypeById(id);
  return {
    key: `${id}#0`,
    id,
    tileX: 2,
    tileZ: 3,
    tilesX: model.tiles.x,
    tilesZ: model.tiles.z,
    rotation: 0,
    x: 2 * TILE_VOXELS,
    z: 3 * TILE_VOXELS,
    y: 0,
    width: model.tiles.x * TILE_VOXELS,
    depth: model.tiles.z * TILE_VOXELS,
  };
};

const PLAYGROUND = placed('playground');
const places = placesFor(venuesOn([PLAYGROUND]), new Map([[PLAYGROUND.key, PLAYGROUND]]), {
  seats: [],
});

// Everybody at the playground; `children` are children, and `party` gives each person's party.
function playground(
  count: number,
  children: ReadonlySet<number>,
  party = (person: number) => person,
) {
  const cast = createCast(count, places);
  recast(
    cast,
    {
      count,
      venueOf: () => 0,
      isWaiting: () => false,
      queuePlace: () => -1,
      isAsleep: () => false,
      isPresent: () => true,
      isChild: (person) => children.has(person),
      partyOf: party,
    },
    new Int32Array(0),
  );
  return cast;
}

const placeOf = (cast: Cast, person: number) => cast.places[cast.placeOf[person]!]!;

const STEP = 1 / 30;

const off = (heading: number, target: number) =>
  Math.abs(Math.atan2(Math.sin(heading - target), Math.cos(heading - target)));

const everybody = (count: number) => new Set(Array.from({ length: count }, (_, person) => person));

describe('play at the playground', () => {
  it('swings a child under the bar, never further out than the chains allow', () => {
    const cast = playground(3, everybody(3));
    for (let person = 0; person < 3; person++) {
      expect((placeOf(cast, person) as SpotActPlace).act).toBe('swing');
    }
    let furthest = 0;
    for (let time = 0; time < 12; time += STEP) {
      perform(cast, time);
      for (let person = 0; person < 3; person++) {
        const seat = placeOf(cast, person) as SpotActPlace;
        const out = Math.hypot(cast.x[person]! - seat.x, cast.z[person]! - seat.z);
        const along =
          (cast.x[person]! - seat.x) * Math.sin(seat.heading) +
          (cast.z[person]! - seat.z) * Math.cos(seat.heading);
        expect(Math.abs(Math.abs(along) - out)).toBeLessThan(1e-4);
        expect(out).toBeLessThanOrEqual(3 + 1e-6);
        expect(cast.y[person]!).toBeGreaterThanOrEqual(seat.y - 1e-6);
        expect(cast.y[person]!).toBeLessThan(seat.pivot!);
        furthest = Math.max(furthest, out);
      }
    }
    expect(furthest).toBeGreaterThan(2.5);
  });

  it('keeps the tower’s riders apart all the way round', () => {
    const tower = places[0]!.visitors.filter(
      (place): place is LoopPlace => place.act === 'loop' && place.loop.riders === 3,
    );
    expect(tower).toHaveLength(3);
    const first = places[0]!.visitors.indexOf(tower[0]!);
    const count = first + 3;
    const cast = playground(count, everybody(count));
    const riders = [first, first + 1, first + 2];
    const { arrive, stops } = tower[0]!.loop;
    let closest = Infinity;
    for (let time = 0; time < arrive[stops.length]!; time += STEP) {
      perform(cast, time);
      for (const a of riders) {
        for (const b of riders) {
          if (a >= b) continue;
          const apart = Math.hypot(
            cast.x[a]! - cast.x[b]!,
            cast.y[a]! - cast.y[b]!,
            cast.z[a]! - cast.z[b]!,
          );
          closest = Math.min(closest, apart);
        }
      }
    }
    expect(closest).toBeGreaterThan(2);
  });

  it('turns a parent on the bench towards their own child, and nobody else’s', () => {
    const swings = 3;
    const benches = places[0]!.visitors.findIndex(
      (place) => place.seat === -1 && !place.forChild && place.pose === RESTING.sitting,
    );
    expect(benches).toBeGreaterThan(swings);
    // The three swingers, then two adults: the first is the middle swinger's parent.
    const count = swings + 2;
    const cast = playground(count, everybody(swings), (person) =>
      person === swings ? 11 : person + 10,
    );
    const parent = swings;
    const stranger = swings + 1;
    expect(placeOf(cast, parent).forChild).toBeUndefined();
    for (let time = 0; time < 4; time += STEP) perform(cast, time);
    const bearing = Math.atan2(cast.x[1]! - cast.x[parent]!, cast.z[1]! - cast.z[parent]!);
    const facing = placeOf(cast, parent).heading;
    expect(off(cast.heading[parent]!, bearing)).toBeLessThan(
      Math.max(off(facing, bearing) - 1.4, 0) + 0.2,
    );
    expect(cast.heading[stranger]).toBeCloseTo(placeOf(cast, stranger).heading, 6);
  });

  it('gives children the play places and their parents the benches', () => {
    // Adults arrive first, so a place in declaration order would hand them the swings.
    const count = 6;
    const cast = playground(count, new Set([3, 4, 5]));
    for (let person = 0; person < 3; person++) {
      const place = placeOf(cast, person);
      expect(place.forChild).toBeUndefined();
      expect(place.pose).toBe(RESTING.sitting);
    }
    for (let person = 3; person < 6; person++) expect(placeOf(cast, person).forChild).toBe(true);
  });

  it('plays the same at the same clock, however the frames fell', () => {
    const count = 22;
    const children = new Set(Array.from({ length: 14 }, (_, person) => person));
    const a = playground(count, children);
    const b = playground(count, children);
    for (let time = 0; time < 30; time += 0.37) perform(a, time);
    perform(a, 30);
    perform(b, 30);
    // Only a parent's heading eases frame by frame; where everybody is and how they stand does not.
    for (let person = 0; person < count; person++) {
      expect([b.x[person], b.y[person], b.z[person], b.pose[person]]).toEqual([
        a.x[person],
        a.y[person],
        a.z[person],
        a.pose[person],
      ]);
    }
  });
});
