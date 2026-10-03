import { TILE_VOXELS, type SoundKind } from '../../../../voxel-gen/voxelgen.ts';
import { SHOWN } from '../../choreography/domain/casting';
import { waterStartZ, type Shore } from '../../layout/domain/shoreline';
import { closeness, kindAt } from './hearing';

export interface SoundSources {
  readonly count: number;
  // Into SOUND_KINDS.
  readonly kind: Uint8Array;
  // The footprint's centre, in tiles.
  readonly x: Float32Array;
  readonly z: Float32Array;
  // Half the footprint's shorter side: standing at a pool's edge is standing at the pool.
  readonly half: Float32Array;
  // Into the venues the list was built with, or -1 for what is not a venue and never closes.
  readonly venue: Int32Array;
}

export interface SourcePlacement {
  readonly key: string;
  readonly id: string;
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
}

// Built once per resort and edit rather than scanned at 5 Hz: a generated plot has thousands of
// placements, most of them silent.
export function soundSourcesOf(
  placements: readonly SourcePlacement[],
  soundOf: (id: string) => SoundKind | null,
  venues: readonly { readonly key: string }[],
): SoundSources {
  const sounding = placements.flatMap((placement) => {
    const kind = soundOf(placement.id);
    return kind === null ? [] : [{ placement, kind }];
  });
  const venueAt = new Map(venues.map((venue, at) => [venue.key, at]));
  const count = sounding.length;
  const sources = {
    count,
    kind: new Uint8Array(count),
    x: new Float32Array(count),
    z: new Float32Array(count),
    half: new Float32Array(count),
    venue: new Int32Array(count),
  };
  sounding.forEach(({ placement, kind }, at) => {
    const { tileX, tileZ, tilesX, tilesZ } = placement;
    sources.kind[at] = kindAt(kind);
    sources.x[at] = tileX + tilesX / 2;
    sources.z[at] = tileZ + tilesZ / 2;
    sources.half[at] = Math.min(tilesX, tilesZ) / 2;
    sources.venue[at] = venueAt.get(placement.key) ?? -1;
  });
  return sources;
}

export interface Listener {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

// Writes `near` and `open` per SoundKind, as HeardScene holds them.
export function gatherSources(
  sources: SoundSources,
  listener: Listener,
  isOpen: (venue: number) => boolean,
  near: Float32Array,
  open: Float32Array,
): void {
  const { x, z, radius } = listener;
  near.fill(0);
  open.fill(0);
  for (let at = 0; at < sources.count; at++) {
    const dx = sources.x[at]! - x;
    const dz = sources.z[at]! - z;
    if (Math.abs(dx) > radius + sources.half[at]! || Math.abs(dz) > radius + sources.half[at]!)
      continue;
    const heard = closeness(Math.hypot(dx, dz) - sources.half[at]!, radius);
    if (heard === 0) continue;
    const kind = sources.kind[at]!;
    near[kind] = near[kind]! + heard;
    const venue = sources.venue[at]!;
    if (venue < 0 || isOpen(venue)) open[kind] = open[kind]! + heard;
  }
  for (let kind = 0; kind < near.length; kind++) {
    open[kind] = near[kind]! > 0 ? open[kind]! / near[kind]! : 0;
  }
}

// O(2·radius): the sea's edge is a function of the column alone.
export function shoreDistance(
  shore: Shore | null,
  tileX: number,
  tileZ: number,
  radius: number,
): number {
  if (!shore) return Infinity;
  const column = Math.floor(tileX);
  let nearest = Infinity;
  for (let dx = -radius; dx <= radius; dx++) {
    const ahead = Math.max(0, waterStartZ(shore, column + dx) - tileZ);
    const distance = Math.hypot(dx, ahead);
    if (distance <= radius && distance < nearest) nearest = distance;
  }
  return nearest;
}

export interface HeardCrowd {
  readonly count: number;
  // In voxels, as the crowd walks.
  readonly x: Float32Array;
  readonly z: Float32Array;
  // Where the cast draws somebody instead, as a swimmer out at sea is.
  readonly shown: Uint8Array;
  readonly placedX: Float32Array;
  readonly placedZ: Float32Array;
  readonly offPlot: Uint8Array;
  readonly present: Uint8Array;
  readonly child: Uint8Array;
  isAsleep(person: number): boolean;
}

export interface HeardGuests {
  guests: number;
  children: number;
  swimmers: number;
}

// A sleeper still stands at their lodging, and a cottage full of them must not chatter all night.
const audible = (crowd: HeardCrowd, person: number): boolean =>
  crowd.present[person] === 1 && crowd.offPlot[person] !== 1 && !crowd.isAsleep(person);

function drawnTile(crowd: HeardCrowd, person: number, at: { x: number; z: number }): void {
  const placed = crowd.shown[person] === SHOWN.placed;
  at.x = (placed ? crowd.placedX : crowd.x)[person]! / TILE_VOXELS;
  at.z = (placed ? crowd.placedZ : crowd.z)[person]! / TILE_VOXELS;
}

const within = (at: { x: number; z: number }, listener: Listener): boolean =>
  Math.hypot(at.x - listener.x, at.z - listener.z) <= listener.radius;

const inWater = (shore: Shore | null, at: { x: number; z: number }): boolean =>
  shore !== null && at.z >= waterStartZ(shore, Math.floor(at.x));

export function hearGuests(
  crowd: HeardCrowd,
  shore: Shore | null,
  listener: Listener,
  into: HeardGuests,
): void {
  into.guests = 0;
  into.children = 0;
  into.swimmers = 0;
  const at = { x: 0, z: 0 };
  for (let person = 0; person < crowd.count; person++) {
    if (!audible(crowd, person)) continue;
    drawnTile(crowd, person, at);
    if (!within(at, listener)) continue;
    into.guests++;
    into.children += crowd.child[person] === 1 ? 1 : 0;
    into.swimmers += inWater(shore, at) ? 1 : 0;
  }
}
