import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { objectTypeById } from '../../catalog/domain/objectTypes';
import { RESTING } from '../../crowd/domain/crowd';
import type { StaffRole } from '../../sim/domain/staff';
import { venuesOn } from '../../sim/domain/venues';
import {
  createCast,
  insideAt,
  keepSeats,
  recast,
  recastStaff,
  SHOWN,
  whereDrawn,
  type Casting,
} from './casting';
import { placesFor, type Place, type PlaceKind, type VenuePlaces } from './places';

const place = (kind: PlaceKind, x: number, seat = -1): Place => ({
  x,
  y: 4,
  z: 10,
  heading: 0.5,
  pose: seat >= 0 ? RESTING.sitting : RESTING.standing,
  kind,
  seat,
});

const places = (parts: Partial<VenuePlaces>): VenuePlaces => ({
  visitors: [],
  watchers: [],
  animators: [],
  lifeguards: [],
  ...parts,
});

const COURT = places({
  visitors: [place('visitor', 1), place('visitor', 2), place('visitor', 3)],
  watchers: [place('watcher', 11, 0), place('watcher', 12, 1), place('watcher', 13, 2)],
});
const RESTROOMS = places({});
const CAFE = places({ visitors: [place('visitor', 21, 3), place('visitor', 22, 4)] });
const STAGE = places({ animators: [place('animator', 31)] });
const ALL = [COURT, RESTROOMS, CAFE, STAGE];

const NONE = -1;

// A router as the cast reads it: a venue per person, -1 for none.
function world(count: number) {
  const venue = new Int32Array(count).fill(NONE);
  const waiting = new Uint8Array(count);
  const queue = new Int32Array(count).fill(-1);
  const asleep = new Uint8Array(count);
  const present = new Uint8Array(count).fill(1);
  const casting: Casting = {
    count,
    venueOf: (person) => venue[person]!,
    isWaiting: (person) => waiting[person] === 1,
    queuePlace: (person) => queue[person]!,
    isAsleep: (person) => asleep[person] === 1,
    isPresent: (person) => present[person] === 1,
  };
  return { venue, waiting, queue, asleep, present, casting };
}

const freeSeats = (): Int32Array => new Int32Array(5).fill(-1);

describe('recast', () => {
  it('places visitors in the order the art declares, where the place is', () => {
    const { venue, casting } = world(3);
    const cast = createCast(3, ALL);
    venue[1] = 0;
    recast(cast, casting, freeSeats());
    expect(cast.shown[0]).toBe(SHOWN.asCrowd);
    expect(cast.shown[1]).toBe(SHOWN.placed);
    expect([cast.x[1], cast.y[1], cast.z[1], cast.heading[1]]).toEqual([1, 4, 10, 0.5]);
    expect(cast.pose[1]).toBe(RESTING.standing);
  });

  it('keeps a party admitted in one tick in places side by side', () => {
    const { venue, casting } = world(5);
    const cast = createCast(5, ALL);
    venue[2] = 0;
    venue[3] = 0;
    recast(cast, casting, freeSeats());
    expect([cast.x[2], cast.x[3]]).toEqual([1, 2]);
  });

  it('frees a place when its visitor leaves, for the next to take', () => {
    const { venue, casting } = world(4);
    const cast = createCast(4, ALL);
    venue.set([0, 0, 0]);
    recast(cast, casting, freeSeats());
    venue[1] = NONE;
    venue[3] = 0;
    recast(cast, casting, freeSeats());
    expect(cast.shown[1]).toBe(SHOWN.asCrowd);
    expect(cast.x[3]).toBe(2);
    expect([cast.x[0], cast.x[2]]).toEqual([1, 3]);
  });

  it('hides whoever an overfull venue has no place for', () => {
    const { venue, casting } = world(6);
    const cast = createCast(6, ALL);
    venue.fill(0);
    venue[5] = 1;
    recast(cast, casting, freeSeats());
    expect(Array.from(cast.shown)).toEqual([1, 1, 1, 2, 2, 2]);
  });

  it('seats a court’s line on the benches by its rank', () => {
    const { venue, waiting, queue, casting } = world(2);
    const cast = createCast(2, ALL);
    venue.fill(0);
    waiting.fill(1);
    queue.set([1, 0]);
    recast(cast, casting, freeSeats());
    expect([cast.x[0], cast.x[1]]).toEqual([12, 11]);
    expect(cast.pose[0]).toBe(RESTING.sitting);
  });

  it('leaves a line with no bench to its lane', () => {
    const { venue, waiting, queue, casting } = world(1);
    const cast = createCast(1, ALL);
    venue[0] = 2;
    waiting[0] = 1;
    queue[0] = 0;
    recast(cast, casting, freeSeats());
    expect(cast.shown[0]).toBe(SHOWN.asCrowd);
  });

  it('hides a guest asleep in their lodging', () => {
    const { venue, asleep, casting } = world(1);
    const cast = createCast(1, ALL);
    venue[0] = 0;
    recast(cast, casting, freeSeats());
    asleep[0] = 1;
    recast(cast, casting, freeSeats());
    expect(cast.shown[0]).toBe(SHOWN.hidden);
    expect(cast.heldBy[0]).toBe(-1);
  });

  it('never casts anybody at the beach, which comes after the resort’s venues', () => {
    const { venue, casting } = world(1);
    const cast = createCast(1, ALL);
    venue[0] = ALL.length;
    recast(cast, casting, freeSeats());
    expect(cast.shown[0]).toBe(SHOWN.asCrowd);
    expect(cast.placeOf[0]).toBe(-1);
  });
});

describe('insideAt', () => {
  it('counts a venue’s visitors, placed or hidden, but not its line nor the beach', () => {
    const { venue, waiting, casting } = world(7);
    const cast = createCast(7, ALL);
    venue.set([0, 0, 0, 0, 0, ALL.length, 2]);
    waiting[4] = 1;
    recast(cast, casting, freeSeats());
    expect(insideAt(cast, 0)).toBe(4);
    expect(insideAt(cast, 2)).toBe(1);
    expect(insideAt(cast, 1)).toBe(0);
    venue.fill(NONE);
    recast(cast, casting, freeSeats());
    expect(insideAt(cast, 0)).toBe(0);
  });
});

describe('keepSeats', () => {
  it('moves a visitor on when a passer-by sits where they were drawn', () => {
    const { venue, casting } = world(1);
    const cast = createCast(1, ALL);
    const seatBy = freeSeats();
    venue[0] = 2;
    recast(cast, casting, seatBy);
    expect(cast.x[0]).toBe(21);
    seatBy[3] = 7;
    keepSeats(cast, casting, seatBy);
    expect(cast.x[0]).toBe(22);
    seatBy[4] = 8;
    keepSeats(cast, casting, seatBy);
    expect(cast.shown[0]).toBe(SHOWN.hidden);
  });
});

describe('recastStaff', () => {
  it('draws an animator at work on the stage’s place, and nobody else', () => {
    const cast = createCast(3, ALL);
    const roles: readonly StaffRole[] = ['cleaner', 'animator', 'animator'];
    const at = [3, 3, NONE];
    recastStaff(
      cast,
      (worker) => at[worker]!,
      (worker) => roles[worker]!,
    );
    expect(Array.from(cast.shown)).toEqual([0, 1, 0]);
    expect(cast.x[1]).toBe(31);
  });
});

describe('whereDrawn', () => {
  it('picks from where people are drawn, and never the hidden', () => {
    const { venue, casting } = world(3);
    const cast = createCast(3, ALL);
    venue.set([0, 1, NONE]);
    recast(cast, casting, freeSeats());
    const people = {
      count: 3,
      x: Float32Array.of(90, 91, 92),
      y: Float32Array.of(0, 0, 0),
      z: Float32Array.of(5, 5, 5),
    };
    const into = {
      count: 3,
      x: new Float32Array(3),
      y: new Float32Array(3),
      z: new Float32Array(3),
    };
    const drawn = whereDrawn(people, cast, into);
    expect(drawn.count).toBe(3);
    expect(Array.from(drawn.x)).toEqual([1, Number.NaN, 92]);
    expect(Array.from(drawn.z)).toEqual([10, Number.NaN, 5]);
  });
});

describe('recast, for somebody in a wheelchair', () => {
  const lounger: Place = { ...place('visitor', 41), pose: RESTING.lying };
  const swing: Place = { ...place('visitor', 42), act: 'swing' };
  const seat = place('visitor', 43, 0);
  const spot = place('visitor', 44);

  const seated = (venues: readonly VenuePlaces[]) => {
    const { venue, casting } = world(2);
    const cast = createCast(2, venues);
    venue[0] = 0;
    recast(cast, { ...casting, inChair: (person) => person === 0 }, freeSeats());
    return cast;
  };

  it('takes a spot to stand at before a seat, and passes the lounger and the swing by', () => {
    const cast = seated([places({ visitors: [lounger, swing, seat, spot] })]);
    expect(cast.chair[0]).toBe(1);
    expect(cast.chair[1]).toBe(0);
    expect(cast.x[0]).toBe(44);
  });

  it('takes a seat where there is no spot, never the lounger', () => {
    const cast = seated([places({ visitors: [lounger, seat] })]);
    expect(cast.shown[0]).toBe(SHOWN.placed);
    expect(cast.x[0]).toBe(43);
  });

  it('watches from the edge of a venue where every place is a game or the water', () => {
    const cast = seated([
      places({ visitors: [swing, lounger], watchers: [place('watcher', 51, 1)] }),
    ]);
    expect(cast.shown[0]).toBe(SHOWN.placed);
    expect(cast.x[0]).toBe(51);
  });
});

const audienceAt = (id: string) => {
  const { model } = objectTypeById(id);
  const placement = {
    key: `${id}#0`,
    id,
    tileX: 0,
    tileZ: 0,
    tilesX: model.tiles.x,
    tilesZ: model.tiles.z,
    rotation: 0 as const,
    x: 0,
    z: 0,
    y: 0,
    width: model.tiles.x * TILE_VOXELS,
    depth: model.tiles.z * TILE_VOXELS,
  };
  const venuePlaces = placesFor(venuesOn([placement]), new Map([[placement.key, placement]]), {
    seats: [],
  });
  return createCast(1, venuePlaces).audiences[0];
};

describe('the audience of a show', () => {
  it('cheers where it stands only at a venue with a dance floor', () => {
    const stage = audienceAt('open-air-stage')!;
    expect(stage.cheering).toHaveLength(32);
    expect(stage.dancing).toHaveLength(48);
    expect(audienceAt('beach-club')?.cheering ?? []).toHaveLength(0);
    expect(audienceAt('kids-club')?.cheering ?? []).toHaveLength(0);
  });
});
