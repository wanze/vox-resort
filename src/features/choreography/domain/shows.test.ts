import { describe, expect, it, vi } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { objectTypeById } from '../../catalog/domain/objectTypes';
import { RESTING } from '../../crowd/domain/crowd';
import type { Placement } from '../../layout/domain/resortLayout';
import { DRAWN_POSE } from '../../rendering/domain/poses';
import { venuesOn } from '../../sim/domain/venues';
import { perform } from './acts';
import { createCast, noteShows, recast, type Cast } from './casting';
import { placesFor } from './places';

// Drawn only: a seeded draw here would move every replay of the simulation.
vi.mock('../../layout/domain/random', () => {
  const refused = new Error('a show drew from a seeded stream');
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

// As many visitors as the venue has places, cast as the frame loop casts them.
function venueFull(id: string) {
  const placement = placed(id);
  const places = placesFor(venuesOn([placement]), new Map([[placement.key, placement]]), {
    seats: [],
  });
  const count = places[0]!.visitors.length;
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
    },
    new Int32Array(0),
  );
  return { cast, count, floor: places[0]!.floor };
}

const STEP = 1 / 20;

const placeOf = (cast: Cast, person: number) => cast.places[cast.placeOf[person]!]!;

function run(cast: Cast, from: number, to: number, look?: (time: number) => void): void {
  for (let time = from; time < to; time += STEP) {
    perform(cast, time);
    look?.(time);
  }
}

describe('a show at the beach club', () => {
  it('gets the stools and the lounge up dancing on the floor, and leaves the daybeds lying', () => {
    const { cast, count, floor } = venueFull('beach-club');
    const sitting = [...Array.from({ length: count }).keys()].filter(
      (person) => placeOf(cast, person).pose === RESTING.sitting,
    );
    const lying = [...Array.from({ length: count }).keys()].filter(
      (person) => placeOf(cast, person).pose === RESTING.lying,
    );
    expect(sitting.length).toBeGreaterThan(8);
    expect(lying.length).toBeGreaterThan(0);
    run(cast, 0, 5);
    for (const person of sitting) expect(cast.pose[person]).toBe(RESTING.sitting);
    noteShows(cast, () => true);
    const steps = new Set<number>();
    run(cast, 5, 30, (time) => {
      if (time < 20) return;
      for (const person of sitting) {
        expect(cast.x[person]!).toBeGreaterThanOrEqual(floor!.minX);
        expect(cast.x[person]!).toBeLessThanOrEqual(floor!.maxX);
        expect(cast.z[person]!).toBeGreaterThanOrEqual(floor!.minZ);
        expect(cast.z[person]!).toBeLessThanOrEqual(floor!.maxZ);
        expect(cast.y[person]).toBe(floor!.ground);
        steps.add(Math.floor(cast.pose[person]!));
      }
      for (const person of lying) expect(cast.pose[person]).toBe(RESTING.lying);
    });
    expect(steps).toEqual(new Set([DRAWN_POSE.jog, DRAWN_POSE.cheer, DRAWN_POSE.hop]));
  });

  it('sits everybody back down where they were once the show is over', () => {
    const { cast, count } = venueFull('beach-club');
    noteShows(cast, () => true);
    run(cast, 0, 20);
    noteShows(cast, () => false);
    run(cast, 20, 40);
    for (let person = 0; person < count; person++) {
      const seat = placeOf(cast, person);
      expect([cast.x[person], cast.y[person], cast.z[person], cast.pose[person]]).toEqual([
        Math.fround(seat.x),
        Math.fround(seat.y),
        Math.fround(seat.z),
        seat.pose,
      ]);
    }
  });
});

describe('the game hall', () => {
  it('hammers the buttons facing the machine, and gathers round the animator for a show', () => {
    const { cast } = venueFull('game-hall');
    const players = [...cast.audiences[0]!.gathering].map((index) => cast.heldBy[index]!);
    expect(players).toHaveLength(8);
    const progress = new Set<number>();
    run(cast, 0, 2, () => {
      for (const person of players) {
        const bay = placeOf(cast, person);
        expect([cast.x[person], cast.z[person], cast.heading[person]]).toEqual([
          Math.fround(bay.x),
          Math.fround(bay.z),
          Math.fround(bay.heading),
        ]);
        expect(Math.floor(cast.pose[person]!)).toBe(DRAWN_POSE.strike);
        progress.add(Math.round(cast.pose[person]! * 10));
      }
    });
    expect(progress.size).toBeGreaterThan(5);
    const animator = cast.places[cast.venues[0]!.animators.start]!;
    noteShows(cast, () => true);
    const poses = new Set<number>();
    run(cast, 2, 15, (time) => {
      if (time < 10) return;
      for (const person of players) {
        const dx = cast.x[person]! - animator.x;
        const dz = cast.z[person]! - animator.z;
        expect(dx * Math.sin(animator.heading) + dz * Math.cos(animator.heading)).toBeGreaterThan(
          3,
        );
        poses.add(Math.floor(cast.pose[person]!));
      }
    });
    expect(poses).toEqual(new Set([DRAWN_POSE.cheer, DRAWN_POSE.hop]));
  });
});
