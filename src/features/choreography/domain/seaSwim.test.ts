import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { RESTING } from '../../crowd/domain/crowd';
import { sandGridFor, type ObstacleBox } from '../../crowd/domain/sandGrid';
import { shoreFor, type Shore } from '../../layout/domain/shoreline';
import { DRAWN_POSE } from '../../rendering/domain/poses';
import { swimmableAt, type Rental } from '../../sea/domain/swimArea';
import { createCast, recast, SHOWN, type Casting } from './casting';
import {
  performAtSea,
  planSwim,
  swimAt,
  SWIM_SHARE,
  SWIM_WINDOW,
  type Bather,
  type SeaShore,
} from './seaSwim';

const BAY: Shore = shoreFor({
  tilesX: 48,
  tilesZ: 40,
  shore: { inset: 8, beach: 10, wave: 2, seed: 5 },
})!;
const RENTAL: Rental = { x: 24 * TILE_VOXELS, z: 30 * TILE_VOXELS };

const seaWith = (
  obstacles: readonly ObstacleBox[] = [],
  rentals: readonly Rental[] = [],
): SeaShore => ({
  sand: sandGridFor({ shore: BAY, tilesX: BAY.tilesX, obstacles }),
  swim: { shore: BAY, rentals },
});

const SEA = seaWith();
const PITCH_Z = 26 * TILE_VOXELS;

const bather = (person: number, x = 10.5 * TILE_VOXELS, ticksLeft = Infinity): Bather => ({
  person,
  x,
  z: PITCH_Z,
  child: false,
  onLounger: false,
  ticksLeft,
});

// The first person who swims in window 0 from this pitch, with the trip they take.
function firstSwimmer(sea: SeaShore, x?: number) {
  for (let person = 0; person < 200; person++) {
    const trip = planSwim(sea, bather(person, x), 0, 0);
    if (trip) return { person, trip };
  }
  throw new Error('nobody swam');
}

const drawn = () => ({
  x: new Float32Array(1),
  y: new Float32Array(1),
  z: new Float32Array(1),
  heading: new Float32Array(1),
  pose: new Float32Array(1),
});

// Every half second of the trip, where the swimmer is drawn.
function samplesOf(trip: NonNullable<ReturnType<typeof planSwim>>) {
  const into = drawn();
  const samples: { x: number; y: number; z: number; pose: number }[] = [];
  for (let time = trip.start; time < trip.start + trip.seconds; time += 0.5) {
    swimAt(trip, time, into, 0);
    samples.push({ x: into.x[0]!, y: into.y[0]!, z: into.z[0]!, pose: into.pose[0]! });
  }
  return samples;
}

describe('planSwim and swimAt', () => {
  it('walks out from the pitch and comes back to it', () => {
    const { trip } = firstSwimmer(SEA);
    const into = drawn();
    expect(swimAt(trip, trip.start - 0.1, into, 0)).toBe(false);
    expect(swimAt(trip, trip.start, into, 0)).toBe(true);
    expect([into.x[0], into.z[0], into.pose[0]]).toEqual([10.5 * TILE_VOXELS, PITCH_Z, 0]);
    expect(swimAt(trip, trip.start + trip.seconds - 1e-6, into, 0)).toBe(true);
    expect(into.x[0]).toBeCloseTo(10.5 * TILE_VOXELS, 2);
    expect(into.z[0]).toBeCloseTo(PITCH_Z, 2);
    expect(swimAt(trip, trip.start + trip.seconds, into, 0)).toBe(false);
  });

  it('swims only inside the buoys, never back over the sand', () => {
    let swum = 0;
    for (let person = 0; person < 60; person++) {
      const x = (4.5 + (person % 40)) * TILE_VOXELS;
      const trip = planSwim(SEA, bather(person, x), 0, 0);
      if (!trip) continue;
      for (const at of samplesOf(trip)) {
        if (at.pose === RESTING.none) continue;
        swum++;
        const band = swimmableAt(SEA.swim, at.x)!;
        expect(band).not.toBeNull();
        expect(at.z).toBeGreaterThanOrEqual(band.fromZ);
        expect(at.z).toBeLessThanOrEqual(band.toZ);
        expect(Math.abs(at.x - x)).toBeLessThanOrEqual(2 * TILE_VOXELS);
      }
    }
    expect(swum).toBeGreaterThan(100);
  });

  it('keeps out of the pedalo corridor', () => {
    const sea = seaWith([], [RENTAL]);
    let swum = 0;
    for (let person = 0; person < 200; person++) {
      const x = (14.5 + (person % 20)) * TILE_VOXELS;
      const trip = planSwim(sea, bather(person, x), 0, 0);
      if (!trip) continue;
      for (const at of samplesOf(trip)) {
        if (at.pose === RESTING.none) continue;
        swum++;
        expect(Math.abs(at.x - RENTAL.x)).toBeGreaterThanOrEqual(4 * TILE_VOXELS);
      }
    }
    expect(swum).toBeGreaterThan(100);
    for (let person = 0; person < 200; person++) {
      expect(planSwim(sea, bather(person, RENTAL.x), 0, 0)).toBeNull();
    }
  });

  it('stays on the sand when something stands between the pitch and the water', () => {
    const x = 10.5 * TILE_VOXELS;
    const parasol: ObstacleBox = { x: x - 4, z: PITCH_Z + 20, width: 8, depth: 8 };
    const blocked = seaWith([parasol]);
    expect(firstSwimmer(SEA).trip).not.toBeNull();
    for (let person = 0; person < 200; person++) {
      expect(planSwim(blocked, bather(person), 0, 0)).toBeNull();
    }
  });

  it('stays on the sand when the stay ends before the swim would', () => {
    const { person } = firstSwimmer(SEA);
    expect(planSwim(SEA, bather(person, undefined, 10), 0, 0)).toBeNull();
    expect(planSwim(SEA, bather(person, undefined, 1000), 0, 0)).not.toBeNull();
  });

  it('has about the share in the water at any moment', () => {
    const shareOf = (child: boolean): number => {
      let away = 0;
      let seen = 0;
      const into = drawn();
      for (let person = 0; person < 3000; person++) {
        const x = (4.5 + (person % 40)) * TILE_VOXELS;
        for (let window = 0; window < 4; window++) {
          const trip = planSwim(SEA, { ...bather(person, x), child }, window, window * SWIM_WINDOW);
          for (let look = 0; look < 4; look++) {
            const time = (window + (look + 0.5) / 4) * SWIM_WINDOW;
            seen++;
            if (trip && swimAt(trip, time, into, 0)) away++;
          }
        }
      }
      return away / seen;
    };
    expect(Math.abs(shareOf(false) - SWIM_SHARE.adult)).toBeLessThan(0.05 * SWIM_SHARE.adult);
    expect(Math.abs(shareOf(true) - SWIM_SHARE.child)).toBeLessThan(0.05 * SWIM_SHARE.child);
  });

  it('stands still between swim legs rather than wading', () => {
    const { trip } = firstSwimmer(SEA);
    const samples = samplesOf(trip);
    const swimming = samples.findIndex((at) => at.pose === DRAWN_POSE.swim);
    const back = samples.findLastIndex((at) => at.pose === DRAWN_POSE.swim);
    const between = samples.slice(swimming, back).filter((at) => at.pose !== DRAWN_POSE.swim);
    expect(between.length).toBeGreaterThan(0);
    for (const at of between) expect(at.pose).toBe(RESTING.standing);
  });

  it('draws the same swimmer at the same place every time', () => {
    const { person, trip } = firstSwimmer(SEA);
    expect(planSwim(SEA, bather(person), 0, 0)).toEqual(trip);
    const once = drawn();
    const again = drawn();
    const time = trip.start + trip.seconds / 2;
    swimAt(trip, time, once, 0);
    swimAt(planSwim(SEA, bather(person), 0, 0)!, time, again, 0);
    expect(again).toEqual(once);
  });
});

// The beach is the router's, past the resort's own venues: here there are none, so it is 0.
function beachWorld(count: number) {
  const venue = new Int32Array(count).fill(0);
  const until = new Float64Array(count).fill(Infinity);
  const crowd = {
    x: new Float32Array(count).fill(10.5 * TILE_VOXELS),
    z: new Float32Array(count).fill(PITCH_Z),
    seat: new Int32Array(count).fill(-1),
  };
  const casting: Casting = {
    count,
    venueOf: (person) => venue[person]!,
    isWaiting: () => false,
    queuePlace: () => -1,
    isAsleep: () => false,
    isPresent: () => true,
    bathing: { restingUntil: (person) => until[person]!, crowd },
  };
  return { venue, until, casting };
}

describe('performAtSea', () => {
  it('draws a guest who stops resting as the crowd has them, at once', () => {
    const { person, trip } = firstSwimmer(SEA);
    const { until, casting } = beachWorld(person + 1);
    const cast = createCast(person + 1, [], SEA);
    recast(cast, casting, new Int32Array(0));
    performAtSea(cast, 0, 0);
    const midway = trip.start + trip.seconds / 2;
    performAtSea(cast, midway, 0);
    expect(cast.shown[person]).toBe(SHOWN.placed);
    until[person] = Number.NaN;
    recast(cast, casting, new Int32Array(0));
    performAtSea(cast, midway, 0);
    expect(cast.shown[person]).toBe(SHOWN.asCrowd);
  });

  it('never sends anybody off the beach for a swim', () => {
    const { venue, casting } = beachWorld(200);
    const shop = { visitors: [], watchers: [], animators: [], lifeguards: [] };
    const cast = createCast(200, [shop], SEA);
    venue.fill(0);
    recast(cast, casting, new Int32Array(0));
    expect(cast.bathers.count).toBe(0);
    for (let time = 0; time < SWIM_WINDOW; time += 1) {
      performAtSea(cast, time, 0);
      expect(cast.shown.every((shown) => shown !== SHOWN.placed)).toBe(true);
    }
  });
});
