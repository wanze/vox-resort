import { describe, expect, it, vi } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { objectTypeById } from '../../catalog/domain/objectTypes';
import { RESTING } from '../../crowd/domain/crowd';
import type { Placement } from '../../layout/domain/resortLayout';
import { DRAWN_POSE } from '../../rendering/domain/poses';
import { venuesOn } from '../../sim/domain/venues';
import { perform } from './acts';
import { createCast, recast, type Cast } from './casting';
import { placesFor, type SpotActPlace } from './places';

// Drawn only: a seeded draw here would move every replay of the simulation.
vi.mock('../../layout/domain/random', () => {
  const refused = new Error('a station drew from a seeded stream');
  const refuse = (): never => {
    throw refused;
  };
  return { createRandom: refuse, resumeRandom: refuse };
});

const { model } = objectTypeById('gym-pavilion');
const GYM: Placement = {
  key: 'gym-pavilion#0',
  id: 'gym-pavilion',
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

const places = placesFor(venuesOn([GYM]), new Map([[GYM.key, GYM]]), { seats: [] });
const stations = places[0]!.visitors.filter(
  (place): place is SpotActPlace => place.act === 'station',
);

// One athlete to each station, cast as the frame loop casts them.
function gym(): Cast {
  const count = stations.length;
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
  return cast;
}

const STEP = 1 / 30;

// Every pose code an athlete is drawn in over a while, and the progress a lift reaches.
function workout(cast: Cast, seconds: number) {
  const codes = stations.map(() => new Set<number>());
  const reach = stations.map(() => [Infinity, -Infinity]);
  for (let time = 0; time < seconds; time += STEP) {
    perform(cast, time);
    for (let person = 0; person < stations.length; person++) {
      const place = cast.places[cast.placeOf[person]!]!;
      expect([cast.x[person], cast.y[person], cast.z[person]]).toEqual([
        Math.fround(place.x),
        Math.fround(place.y),
        Math.fround(place.z),
      ]);
      expect(cast.heading[person]).toBe(Math.fround(place.heading));
      const pose = cast.pose[person]!;
      codes[person]!.add(Math.floor(pose));
      reach[person]![0] = Math.min(reach[person]![0]!, pose);
      reach[person]![1] = Math.max(reach[person]![1]!, pose);
    }
  }
  return { codes, reach };
}

describe('the gym’s stations', () => {
  it('keeps every athlete where the art puts them, facing its way', () => {
    expect(new Set(stations.map((place) => place.station))).toEqual(
      new Set(['run', 'jump', 'lift', 'mat']),
    );
    workout(gym(), 10);
  });

  it('cycles each station through its own movement', () => {
    const cast = gym();
    const { codes, reach } = workout(cast, 10);
    for (let person = 0; person < stations.length; person++) {
      const { station } = cast.places[cast.placeOf[person]!] as SpotActPlace;
      if (station === 'run') expect(codes[person]).toEqual(new Set([DRAWN_POSE.jog]));
      if (station === 'jump') {
        expect(codes[person]).toEqual(new Set([DRAWN_POSE.cheer, RESTING.standing]));
      }
      if (station === 'mat')
        expect(codes[person]).toEqual(new Set([RESTING.lying, RESTING.sitting]));
      if (station !== 'lift') continue;
      expect(codes[person]).toEqual(new Set([DRAWN_POSE.reach]));
      expect(reach[person]![0]).toBeLessThan(DRAWN_POSE.reach + 0.1);
      expect(reach[person]![1]).toBeGreaterThan(DRAWN_POSE.reach + 0.9);
    }
  });

  it('works out the same at the same clock, however the frames fell', () => {
    const a = gym();
    const b = gym();
    for (let time = 0; time < 20; time += 0.29) perform(a, time);
    perform(a, 20);
    perform(b, 20);
    expect(Array.from(b.pose)).toEqual(Array.from(a.pose));
  });
});

describe('the beach shower', () => {
  it('rinses under the rose, hands up and down by turns, turning slowly on the spot', () => {
    const { model: shower } = objectTypeById('beach-shower');
    const placement: Placement = {
      ...GYM,
      key: 'beach-shower#0',
      id: 'beach-shower',
      tilesX: shower.tiles.x,
      tilesZ: shower.tiles.z,
      width: shower.tiles.x * TILE_VOXELS,
      depth: shower.tiles.z * TILE_VOXELS,
    };
    const showered = placesFor(venuesOn([placement]), new Map([[placement.key, placement]]), {
      seats: [],
    });
    const cast = createCast(1, showered);
    recast(
      cast,
      {
        count: 1,
        venueOf: () => 0,
        isWaiting: () => false,
        queuePlace: () => -1,
        isAsleep: () => false,
        isPresent: () => true,
      },
      new Int32Array(0),
    );
    const rose = cast.places[cast.placeOf[0]!]!;
    const poses = new Set<number>();
    let turned = 0;
    let last = Number.NaN;
    for (let time = 0; time < 16; time += STEP) {
      perform(cast, time);
      expect([cast.x[0], cast.y[0], cast.z[0]]).toEqual([
        Math.fround(rose.x),
        Math.fround(rose.y),
        Math.fround(rose.z),
      ]);
      poses.add(cast.pose[0]!);
      const heading = cast.heading[0]!;
      if (!Number.isNaN(last)) {
        const step = Math.atan2(Math.sin(heading - last), Math.cos(heading - last));
        expect(step).toBeGreaterThan(0);
        expect(step).toBeLessThan(0.05);
        turned += step;
      }
      last = heading;
    }
    expect(poses).toEqual(new Set([DRAWN_POSE.cheer, DRAWN_POSE.wade]));
    expect(turned).toBeGreaterThan(2 * Math.PI);
  });
});
