import { describe, expect, it, vi } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { objectTypeById } from '../../catalog/domain/objectTypes';
import { RESTING } from '../../crowd/domain/crowd';
import type { Placement } from '../../layout/domain/resortLayout';
import { DRAWN_POSE } from '../../rendering/domain/poses';
import { venuesOn } from '../../sim/domain/venues';
import { perform } from './acts';
import { createCast, noteShows, recast, type Cast } from './casting';
import { placesFor, type LoopPlace } from './places';

// Drawn only: a seeded draw here would move every replay of the simulation.
vi.mock('../../layout/domain/random', () => {
  const refused = new Error('tag drew from a seeded stream');
  const refuse = (): never => {
    throw refused;
  };
  return { createRandom: refuse, resumeRandom: refuse };
});

const { model } = objectTypeById('kids-club');
const CLUB: Placement = {
  key: 'kids-club#0',
  id: 'kids-club',
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

const places = placesFor(venuesOn([CLUB]), new Map([[CLUB.key, CLUB]]), { seats: [] });

// A club full of children, cast as the frame loop casts them.
function club(): Cast {
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
      isChild: () => true,
    },
    new Int32Array(0),
  );
  return cast;
}

const playersOf = (cast: Cast): number[] =>
  [...cast.tag[0]!.places].map((index) => cast.heldBy[index]!);

const STEP = 1 / 20;

describe('the kids club', () => {
  it('plays tag in the yard, running and hopping, never outside it', () => {
    const cast = club();
    const { yard } = cast.tag[0]!;
    const players = playersOf(cast);
    expect(players).toHaveLength(6);
    const poses = new Set<number>();
    let moved = 0;
    const start = players.map((person) => [cast.x[person]!, cast.z[person]!] as const);
    for (let time = 0; time < 60; time += STEP) {
      perform(cast, time);
      for (const [at, person] of players.entries()) {
        expect(cast.x[person]!).toBeGreaterThanOrEqual(yard.minX);
        expect(cast.x[person]!).toBeLessThanOrEqual(yard.maxX);
        expect(cast.z[person]!).toBeGreaterThanOrEqual(yard.minZ);
        expect(cast.z[person]!).toBeLessThanOrEqual(yard.maxZ);
        expect(cast.y[person]).toBe(yard.ground);
        poses.add(Math.floor(cast.pose[person]!));
        moved = Math.max(
          moved,
          Math.hypot(cast.x[person]! - start[at]![0], cast.z[person]! - start[at]![1]),
        );
      }
    }
    expect(moved).toBeGreaterThan(5);
    expect(poses).toEqual(new Set([DRAWN_POSE.jog, DRAWN_POSE.hop, RESTING.standing]));
  });

  it('gathers the yard in front of the animator for a show, and lets it go after', () => {
    const cast = club();
    const animator = cast.places[cast.venues[0]!.animators.start]!;
    const players = playersOf(cast);
    for (let time = 0; time < 10; time += STEP) perform(cast, time);
    noteShows(cast, () => true);
    const poses = new Set<number>();
    for (let time = 10; time < 20; time += STEP) {
      perform(cast, time);
      if (time < 16) continue;
      for (const person of players) {
        const dx = cast.x[person]! - animator.x;
        const dz = cast.z[person]! - animator.z;
        expect(dx * Math.sin(animator.heading) + dz * Math.cos(animator.heading)).toBeGreaterThan(
          3,
        );
        expect(Math.hypot(dx, dz)).toBeLessThan(10);
        const facing = Math.atan2(-dx, -dz);
        expect(Math.cos(cast.heading[person]! - facing)).toBeGreaterThan(0.999);
        poses.add(Math.floor(cast.pose[person]!));
      }
    }
    expect(poses).toEqual(new Set([DRAWN_POSE.cheer, DRAWN_POSE.hop]));
    noteShows(cast, () => false);
    for (let time = 20; time < 30; time += STEP) perform(cast, time);
    const near = players.filter(
      (person) => Math.hypot(cast.x[person]! - animator.x, cast.z[person]! - animator.z) < 4.5,
    );
    expect(Math.floor(cast.pose[players[0]!]!)).not.toBe(DRAWN_POSE.cheer);
    expect(near.length).toBeLessThan(players.length);
  });

  it('sends a child up the slide’s ladder, over the deck and down the chute sitting', () => {
    const rider = places[0]!.visitors.findIndex((place) => place.act === 'loop');
    const { loop } = places[0]!.visitors[rider] as LoopPlace;
    const cast = club();
    const person = cast.heldBy[cast.venues[0]!.visitors.start + rider]!;
    let highest = -Infinity;
    let slid = 0;
    for (let time = 0; time < loop.arrive[loop.stops.length]!; time += STEP) {
      perform(cast, time);
      highest = Math.max(highest, cast.y[person]!);
      if (cast.pose[person] === RESTING.sitting) slid++;
    }
    expect(highest).toBeGreaterThanOrEqual(CLUB.y + 11);
    expect(slid).toBeGreaterThan(0);
  });

  it('plays the same at the same clock, however the frames fell', () => {
    const a = club();
    const b = club();
    for (let time = 0; time < 40; time += 0.43) perform(a, time);
    perform(a, 40);
    perform(b, 40);
    for (const person of playersOf(a)) {
      expect([b.x[person], b.z[person], b.pose[person]]).toEqual([
        a.x[person],
        a.z[person],
        a.pose[person],
      ]);
    }
  });
});
