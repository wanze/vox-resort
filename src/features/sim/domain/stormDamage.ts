import { waterStartZ, type Shore } from '../../layout/domain/shoreline';
import { fnv, mix, unitOf } from '../../random/domain/hash';

export interface Footprint {
  readonly key: string;
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
}

export interface StormHit {
  readonly key: string;
  // Condition lost, out of 1.
  readonly dent: number;
}

// The beach is about this deep, so a bar at the back of the sand still feels the spray.
export const STORM_REACH = 6;

// Per building and storm hour, at the water's edge. Ten on the edge lose about one a storm, and
// one storm in three passes with nothing worse than wet sand.
const HIT_PER_HOUR = 0.005;

// Two at most a day, so a storm costs a renovation or two, never the whole front.
export const MOST_HITS_A_DAY = 2;

// From worn to shabby on a building that was already tired; a new one comes out merely worn.
const DENT = { min: 0.2, max: 0.35 } as const;

const HIT_SALT = 0x5703_4d01;
const DENT_SALT = 0x5703_4d02;

// Hashed by key and hour rather than drawn from a stream, so a storm moves no other seeded draw.
const drawFor = (key: string, hour: number, salt: number): number =>
  unitOf(mix(fnv(key) ^ Math.imul(hour + 1, 2_654_435_761) ^ salt));

// 1 on the water's edge or over it, falling to 0 at STORM_REACH. The sea lies to +z.
export function exposureOf(shore: Shore | null, place: Footprint): number {
  if (!shore) return 0;
  let gap = Infinity;
  for (let x = place.tileX; x < place.tileX + place.tilesX; x++) {
    gap = Math.min(gap, waterStartZ(shore, x) - (place.tileZ + place.tilesZ));
  }
  return Math.max(0, 1 - Math.max(0, gap) / STORM_REACH);
}

export function stormHitsAt(
  places: readonly Footprint[],
  shore: Shore | null,
  hour: number,
  room: number,
  spared: (key: string) => boolean,
): readonly StormHit[] {
  const hits: StormHit[] = [];
  for (const place of places) {
    if (hits.length >= room) break;
    if (spared(place.key)) continue;
    const exposure = exposureOf(shore, place);
    if (exposure <= 0 || drawFor(place.key, hour, HIT_SALT) >= HIT_PER_HOUR * exposure) continue;
    const dent = DENT.min + (DENT.max - DENT.min) * drawFor(place.key, hour, DENT_SALT);
    hits.push({ key: place.key, dent });
  }
  return hits;
}
