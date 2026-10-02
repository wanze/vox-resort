import { describe, expect, it, vi } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { objectTypeById } from '../../catalog/domain/objectTypes';
import { RESTING } from '../../crowd/domain/crowd';
import type { Placement } from '../../layout/domain/resortLayout';
import { DRAWN_POSE } from '../../rendering/domain/poses';
import type { StaffRole } from '../../sim/domain/staff';
import { venuesOn } from '../../sim/domain/venues';
import { perform } from './acts';
import { createCast, recast, recastStaff, SHOWN, WORK, type Cast, type StaffAt } from './casting';
import { placesFor } from './places';
import { performWork } from './work';

// Drawn only: a seeded draw here would move every replay of the simulation.
vi.mock('../../layout/domain/random', () => {
  const refused = new Error('work drew from a seeded stream');
  const refuse = (): never => {
    throw refused;
  };
  return { createRandom: refuse, resumeRandom: refuse };
});

const placed = (id: string, tileX: number): Placement => {
  const { model } = objectTypeById(id);
  return {
    key: `${id}#0`,
    id,
    tileX,
    tileZ: 0,
    tilesX: model.tiles.x,
    tilesZ: model.tiles.z,
    rotation: 0,
    x: tileX * TILE_VOXELS,
    z: 0,
    y: 0,
    width: model.tiles.x * TILE_VOXELS,
    depth: model.tiles.z * TILE_VOXELS,
  };
};

const POOL = 0;
const PLAYGROUND = 1;
const CLUB = 2;
const PLACEMENTS = [placed('swimming-pool', 0), placed('playground', 10), placed('beach-club', 20)];
const places = placesFor(
  venuesOn(PLACEMENTS),
  new Map(PLACEMENTS.map((placement) => [placement.key, placement])),
  { seats: [] },
);

// Where the staff router holds everybody: somewhere recognisable, off every place.
const HELD: StaffAt = {
  x: Float32Array.from({ length: 8 }, (_, worker) => 500 + worker),
  y: new Float32Array(8).fill(7),
  z: new Float32Array(8).fill(600),
  heading: new Float32Array(8).fill(1),
};

function staffAt(roles: readonly StaffRole[], venues: readonly number[]): Cast {
  const cast = createCast(roles.length, places);
  recastStaff(
    cast,
    (worker) => venues[worker]!,
    (worker) => roles[worker]!,
    HELD,
  );
  return cast;
}

// Children on the playground's swings, for an animator to play to.
function audience(): Cast {
  const cast = createCast(3, places);
  recast(
    cast,
    {
      count: 3,
      venueOf: () => PLAYGROUND,
      isWaiting: () => false,
      queuePlace: () => -1,
      isAsleep: () => false,
      isPresent: () => true,
      isChild: () => true,
    },
    new Int32Array(0),
  );
  perform(cast, 0);
  return cast;
}

const placeOf = (cast: Cast, worker: number) => cast.places[cast.placeOf[worker]!]!;

const STEP = 1 / 10;

describe('the staff at work', () => {
  it('draws each role at its venue doing its job', () => {
    const roles: StaffRole[] = ['animator', 'lifeguard', 'cleaner', 'mechanic'];
    const cast = staffAt(roles, [PLAYGROUND, POOL, POOL, PLAYGROUND]);
    const guests = audience();
    expect([...cast.work]).toEqual([WORK.show, WORK.watch, WORK.sweep, WORK.mend]);
    const codes = roles.map(() => new Set<number>());
    let swept = 0;
    for (let time = 0; time < 200; time += STEP) {
      performWork(cast, guests, time);
      for (let worker = 0; worker < roles.length; worker++) {
        codes[worker]!.add(Math.floor(cast.pose[worker]!));
      }
      const pool = placeOf(cast, 1);
      const off = Math.atan2(
        Math.sin(cast.heading[1]! - pool.heading),
        Math.cos(cast.heading[1]! - pool.heading),
      );
      expect(Math.abs(off)).toBeLessThanOrEqual(0.7 + 1e-6);
      swept = Math.max(swept, Math.abs(off));
      const broom = placeOf(cast, 2);
      expect(Math.hypot(cast.x[2]! - broom.x, cast.z[2]! - broom.z)).toBeLessThanOrEqual(
        0.6 + 1e-5,
      );
      const bench = placeOf(cast, 3);
      expect(cast.y[3]).toBe(Math.fround(bench.y - 1.5));
    }
    expect(codes[0]).toEqual(new Set([DRAWN_POSE.cheer, DRAWN_POSE.hop, DRAWN_POSE.strike]));
    let x = 0;
    let z = 0;
    for (let person = 0; person < 3; person++) {
      x += guests.x[person]! / 3;
      z += guests.z[person]! / 3;
    }
    expect(cast.heading[0]).toBeCloseTo(Math.atan2(x - cast.x[0]!, z - cast.z[0]!), 5);
    expect(codes[1]).toEqual(new Set([RESTING.standing, DRAWN_POSE.reach]));
    expect(swept).toBeGreaterThan(0.6);
    expect(codes[2]).toEqual(new Set([DRAWN_POSE.strike]));
    expect(codes[3]).toEqual(new Set([DRAWN_POSE.strike, RESTING.standing]));
  });

  it('leaves a cleaner making up a room where the sim hides them', () => {
    const cast = staffAt(['cleaner', 'cleaner'], [-1, -1]);
    performWork(cast, null, 3);
    expect([...cast.shown]).toEqual([SHOWN.asCrowd, SHOWN.asCrowd]);
    expect([...cast.work]).toEqual([WORK.none, WORK.none]);
  });

  it('draws a mechanic at the staff place the art declares, or where the sim holds them', () => {
    const cast = staffAt(['mechanic', 'mechanic'], [POOL, CLUB]);
    performWork(cast, null, 0.1);
    const spot = places[POOL]!.staff![0]!;
    expect([cast.x[0], cast.z[0]]).toEqual([Math.fround(spot.x), Math.fround(spot.z)]);
    expect(cast.placeOf[1]).toBe(-1);
    expect(cast.shown[1]).toBe(SHOWN.placed);
    expect([cast.x[1], cast.y[1], cast.z[1]]).toEqual([HELD.x[1], HELD.y[1]! - 1.5, HELD.z[1]]);
  });

  it('draws a cleaner sweeping a path sweeping, where the sim holds them', () => {
    const cast = createCast(2, places);
    const sweeping = [true, false];
    const recastNow = (): void =>
      recastStaff(
        cast,
        () => -1,
        () => 'cleaner',
        HELD,
        (worker) => sweeping[worker]!,
      );
    recastNow();
    expect([...cast.work]).toEqual([WORK.sweep, WORK.none]);
    performWork(cast, null, 2);
    expect(Math.hypot(cast.x[0]! - HELD.x[0]!, cast.z[0]! - HELD.z[0]!)).toBeLessThanOrEqual(
      0.6 + 1e-5,
    );
    expect(cast.y[0]).toBe(HELD.y[0]);
    expect(Math.floor(cast.pose[0]!)).toBe(DRAWN_POSE.strike);
    sweeping[0] = false;
    recastNow();
    expect(cast.work[0], 'still sweeping after the tile was done').toBe(WORK.none);
    expect(cast.shown[0]).toBe(SHOWN.asCrowd);
  });

  it('leaves a cleaner on the way to a littered tile walking as the crowd has them', () => {
    const cast = createCast(1, places);
    recastStaff(
      cast,
      () => -1,
      () => 'cleaner',
      HELD,
      () => false,
    );
    performWork(cast, null, 2);
    expect(cast.shown[0]).toBe(SHOWN.asCrowd);
    expect(cast.work[0]).toBe(WORK.none);
  });

  it('casts nobody who is not at work, whatever their role', () => {
    const roles: StaffRole[] = ['animator', 'lifeguard', 'cleaner', 'mechanic'];
    const cast = staffAt(roles, [PLAYGROUND, POOL, POOL, PLAYGROUND]);
    recastStaff(
      cast,
      () => -1,
      (worker) => roles[worker]!,
      HELD,
    );
    performWork(cast, null, 5);
    expect([...cast.shown]).toEqual([0, 0, 0, 0]);
    expect([...cast.work]).toEqual([0, 0, 0, 0]);
  });

  it('works the same at the same clock, however the frames fell', () => {
    const roles: StaffRole[] = ['animator', 'lifeguard', 'cleaner', 'mechanic'];
    const a = staffAt(roles, [PLAYGROUND, POOL, POOL, PLAYGROUND]);
    const b = staffAt(roles, [PLAYGROUND, POOL, POOL, PLAYGROUND]);
    for (let time = 0; time < 30; time += 0.37) performWork(a, null, time);
    performWork(a, null, 30);
    performWork(b, null, 30);
    for (const field of ['x', 'y', 'z', 'heading', 'pose'] as const) {
      expect(Array.from(b[field])).toEqual(Array.from(a[field]));
    }
  });
});
