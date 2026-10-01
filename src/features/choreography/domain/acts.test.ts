import { describe, expect, it, vi } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { RESTING } from '../../crowd/domain/crowd';
import type { Placement } from '../../layout/domain/resortLayout';
import { DRAWN_POSE } from '../../rendering/domain/poses';
import { venuesOn } from '../../sim/domain/venues';
import { perform, SWIM_SINK, TREAD_SINK, WADE_SINK, type WaterArea } from './acts';
import { createCast, recast, type Cast } from './casting';
import { placesFor, type AreaPlace, type LoopPlace } from './places';

// Acts are drawn only: a seeded draw here would move every replay of the simulation.
vi.mock('../../layout/domain/random', () => {
  const refused = new Error('acts drew from a seeded stream');
  const refuse = (): never => {
    throw refused;
  };
  return { createRandom: refuse, resumeRandom: refuse };
});

const POOL: Placement = {
  key: 'swimming-pool#0',
  id: 'swimming-pool',
  tileX: 2,
  tileZ: 3,
  tilesX: 8,
  tilesZ: 6,
  rotation: 0,
  x: 2 * TILE_VOXELS,
  z: 3 * TILE_VOXELS,
  y: 0,
  width: 8 * TILE_VOXELS,
  depth: 6 * TILE_VOXELS,
};

const places = placesFor(venuesOn([POOL]), new Map([[POOL.key, POOL]]), { seats: [] });

// Everybody at the pool, the given ones children, cast as the frame loop casts them.
function poolCast(count: number, children: ReadonlySet<number> = new Set()): Cast {
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
    },
    new Int32Array(0),
  );
  return cast;
}

const placeOf = (cast: Cast, person: number) => cast.places[cast.placeOf[person]!]!;
const areaOf = (cast: Cast, person: number) => (placeOf(cast, person) as AreaPlace).area;

const STEP = 0.1;

const mean = (all: readonly number[]): number =>
  all.reduce((sum, value) => sum + value, 0) / all.length;

function sample(cast: Cast, seconds: number, look: (time: number) => void): void {
  for (let time = 0; time <= seconds; time += STEP) {
    perform(cast, time);
    look(time);
  }
}

const inside = (area: WaterArea, x: number, z: number): boolean => {
  if (!area.round) return x >= area.minX && x <= area.maxX && z >= area.minZ && z <= area.maxZ;
  const u = (x - (area.minX + area.maxX) / 2) / ((area.maxX - area.minX) / 2);
  const v = (z - (area.minZ + area.maxZ) / 2) / ((area.maxZ - area.minZ) / 2);
  return u * u + v * v <= 1;
};

describe('acts in an area', () => {
  it('keeps a lap swimmer in their lane, and turns them at each end', () => {
    for (let person = 0; person < 8; person++) {
      const cast = poolCast(8);
      expect(placeOf(cast, person).act).toBe('laps');
      const area = areaOf(cast, person);
      const lane = new Set<number>();
      let west = Infinity;
      let east = -Infinity;
      const headings = new Set<number>();
      sample(cast, 300, () => {
        const x = cast.x[person]!;
        const z = cast.z[person]!;
        expect(inside(area, x, z), `${person} at ${x},${z}`).toBe(true);
        lane.add(z);
        west = Math.min(west, x);
        east = Math.max(east, x);
        if (cast.pose[person] === DRAWN_POSE.swim)
          headings.add(Math.sign(Math.sin(cast.heading[person]!)));
      });
      expect(lane.size).toBe(1);
      expect(west).toBeLessThan(area.minX + 3);
      expect(east).toBeGreaterThan(area.maxX - 3);
      expect(headings).toEqual(new Set([1, -1]));
    }
  });

  it('keeps a wanderer in the water, standing in it between legs', () => {
    for (const person of [8, 9]) {
      const cast = poolCast(10);
      expect(placeOf(cast, person).act).toBe('swim');
      const area = areaOf(cast, person);
      const poses = new Set<number>();
      sample(cast, 120, () => {
        expect(inside(area, cast.x[person]!, cast.z[person]!)).toBe(true);
        poses.add(cast.pose[person]!);
      });
      expect(poses).toEqual(new Set([DRAWN_POSE.swim, RESTING.standing]));
    }
  });

  it('keeps a wading child in the paddling pool', () => {
    const children = new Set([0, 1, 2, 3, 4, 5]);
    for (const person of children) {
      const cast = poolCast(6, children);
      expect(placeOf(cast, person)).toMatchObject({ act: 'wade', forChild: true });
      const area = areaOf(cast, person);
      expect(area.round).toBe(true);
      const poses = new Set<number>();
      sample(cast, 120, () => {
        expect(inside(area, cast.x[person]!, cast.z[person]!)).toBe(true);
        poses.add(cast.pose[person]!);
      });
      expect(poses).toEqual(new Set([DRAWN_POSE.wade, DRAWN_POSE.hop]));
    }
  });

  it('draws everybody in the water under its surface by the act’s sink', () => {
    const children = new Set([20, 21]);
    const cast = poolCast(22, children);
    const inWater = [0, 1, 8, 9, 20, 21];
    sample(cast, 60, () => {
      for (const person of inWater) {
        const place = placeOf(cast, person) as AreaPlace;
        const pose = cast.pose[person]!;
        let sink = SWIM_SINK;
        if (place.act === 'wade') sink = WADE_SINK;
        else if (pose === RESTING.standing) sink = TREAD_SINK;
        expect(cast.y[person]).toBe(place.area.surface - sink);
      }
    });
  });
});

describe('acts on a loop', () => {
  const riders = [10, 11, 12, 13];
  const loopOf = (cast: Cast) => (placeOf(cast, riders[0]!) as LoopPlace).loop;

  it('keeps its riders apart, one timetable a quarter turn apart', () => {
    const cast = poolCast(14);
    const loop = loopOf(cast);
    const period = loop.arrive[loop.stops.length]!;
    const leader = poolCast(14);
    sample(cast, 60, (time) => {
      for (const [a, first] of riders.entries()) {
        for (const second of riders.slice(a + 1)) {
          const apart = Math.hypot(
            cast.x[first]! - cast.x[second]!,
            cast.y[first]! - cast.y[second]!,
            cast.z[first]! - cast.z[second]!,
          );
          expect(apart, `${first} and ${second} at ${time}`).toBeGreaterThan(1);
        }
      }
      for (const [index, rider] of riders.entries()) {
        perform(leader, time + (index * period) / riders.length);
        expect(cast.x[rider]).toBeCloseTo(leader.x[riders[0]!]!, 3);
        expect(cast.z[rider]).toBeCloseTo(leader.z[riders[0]!]!, 3);
      }
    });
  });

  it('comes down the slide faster than it goes up the ladder', () => {
    const cast = poolCast(14);
    const rider = riders[0]!;
    const speeds = { climb: [] as number[], slide: [] as number[] };
    let last: { x: number; y: number; z: number; pose: number } | null = null;
    sample(cast, 60, () => {
      const now = {
        x: cast.x[rider]!,
        y: cast.y[rider]!,
        z: cast.z[rider]!,
        pose: cast.pose[rider]!,
      };
      if (last && last.pose === now.pose) {
        const speed = Math.hypot(now.x - last.x, now.y - last.y, now.z - last.z) / STEP;
        if (now.pose === DRAWN_POSE.jog) speeds.climb.push(speed);
        if (now.pose === RESTING.sitting) speeds.slide.push(speed);
      }
      last = now;
    });
    expect(speeds.climb.length).toBeGreaterThan(0);
    expect(speeds.slide.length).toBeGreaterThan(0);
    expect(mean(speeds.slide)).toBeGreaterThan(2 * mean(speeds.climb));
  });
});

describe('perform', () => {
  it('draws the same person at the same time at the same point, however the frames fell', () => {
    const children = new Set([20, 21]);
    const stepped = poolCast(36, children);
    const jumped = poolCast(36, children);
    sample(stepped, 200, () => {});
    perform(stepped, 200);
    perform(jumped, 0);
    perform(jumped, 200);
    for (let person = 0; person < 36; person++) {
      expect([stepped.x[person], stepped.y[person], stepped.z[person]], `${person}`).toEqual([
        jumped.x[person],
        jumped.y[person],
        jumped.z[person],
      ]);
    }
  });

  it('leaves the loungers where 044 put them', () => {
    const cast = poolCast(36);
    const lying = [...Array(36).keys()].filter((person) => placeOf(cast, person).act === undefined);
    expect(lying.length).toBeGreaterThan(0);
    const before = lying.map((person) => [cast.x[person], cast.y[person], cast.z[person]]);
    sample(cast, 10, () => {});
    expect(lying.map((person) => [cast.x[person], cast.y[person], cast.z[person]])).toEqual(before);
  });
});
