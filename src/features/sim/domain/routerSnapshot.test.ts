import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { createCrowd, type Crowd } from '../../crowd/domain/crowd';
import { walkNetworkFor } from '../../crowd/domain/walkNetwork';
import { createGuests } from '../../guests/domain/guests';
import { createNeeds } from './needs';
import { createRouter } from './router';
import { routerPerPerson, routerSnapshotSchema, routerVenuesMatch } from './routerSnapshot';
import { createUpkeep } from './upkeep';
import type { Venue } from './venues';

const network = walkNetworkFor({
  paved: Array.from({ length: 6 }, (_, tileX) => ({ tileX, tileZ: 0, y: 0 })),
  levelOf: () => 0,
  shore: null,
  tilesX: 6,
});

const bakery = (key: string, tileX: number): Venue => ({
  key,
  id: 'bakery',
  label: 'Bakery',
  role: 'food',
  satisfies: [{ need: 'hunger', amount: 0.5 }],
  capacity: 2,
  dwellSeconds: { min: 240, max: 480 },
  x: (tileX + 0.5) * TILE_VOXELS,
  z: -0.5 * TILE_VOXELS,
  tileX,
  tileZ: -1,
  tilesX: 1,
  tilesZ: 1,
  doors: [],
});

function routerFor(venues: readonly Venue[]) {
  const guests = createGuests({ count: 12, homes: [], variants: 2, childVariant: 1, seed: 2 });
  let crowd: Crowd | null = null;
  const router = createRouter({
    guests,
    needs: createNeeds(guests, 3),
    venues,
    lodgings: [],
    gateways: [],
    onLeave: () => {},
    network,
    tickOfDay: () => 12 * 60,
    crowd: () => crowd!,
    upkeep: () => createUpkeep(venues.length),
    seed: 4,
  });
  crowd = createCrowd({
    network,
    count: guests.count,
    variants: 2,
    seed: 5,
    routeOf: (person, at) => router.step(person, at),
  });
  return router;
}

describe('a router snapshot', () => {
  it('parses as saved, and names a column per guest for every per-person array', () => {
    const snapshot = routerFor([bakery('a#0', 2)]).snapshot();
    expect(routerSnapshotSchema.safeParse(snapshot).success).toBe(true);
    const lengths = routerPerPerson(snapshot).map((column) => column.length);
    expect(new Set(lengths)).toEqual(new Set([12]));
  });

  it('refuses a queue time that is not a Float64Array', () => {
    const snapshot = routerFor([bakery('a#0', 2)]).snapshot();
    const until = new Float32Array(snapshot.occupancy.until);
    const broken = { ...snapshot, occupancy: { ...snapshot.occupancy, until } };
    expect(routerSnapshotSchema.safeParse(broken).success).toBe(false);
  });

  it('matches only the venue count it was taken on', () => {
    const snapshot = routerFor([bakery('a#0', 2), bakery('b#0', 4)]).snapshot();
    expect(routerVenuesMatch(snapshot, 2)).toBe(true);
    expect(routerVenuesMatch(snapshot, 3)).toBe(false);
    expect(routerVenuesMatch({ ...snapshot, fieldsBuilt: [2] }, 2)).toBe(false);
  });

  it('is refused by a router on another venue list', () => {
    const snapshot = routerFor([bakery('a#0', 2)]).snapshot();
    const other = routerFor([bakery('a#0', 2), bakery('b#0', 4)]);
    expect(() => other.restore(snapshot)).toThrow();
  });
});
