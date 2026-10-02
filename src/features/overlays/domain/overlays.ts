import { ARCHETYPES } from '../../sim/domain/archetypes';
import { TILE_VOXELS, type GuestNeed } from '../../../../voxel-gen/voxelgen.ts';

export const OVERLAY_KINDS = [
  'footfall',
  'mood',
  'reach-food',
  'reach-drink',
  'reach-wash',
  'step-free',
  'scenery',
  'litter',
] as const;

export type OverlayKind = (typeof OVERLAY_KINDS)[number];

export interface Footfall {
  readonly seen: Float32Array;
  readonly mood: Float32Array;
}

// One unhappy passer-by is not a place: below this many sightings a node says nothing.
export const MIN_SEEN = 5;

// In hops, one a tile: the smallest reach, which is also where the advice starts saying far-from-home.
export const TOO_FAR_HOPS = ARCHETYPES.family.reach / TILE_VOXELS;

export function createFootfall(nodes: number): Footfall {
  const count = Math.max(0, nodes);
  return { seen: new Float32Array(count), mood: new Float32Array(count) };
}

export function sampleFootfall(
  footfall: Footfall,
  node: Int32Array,
  present: Uint8Array,
  mood: Float32Array,
): void {
  const { seen } = footfall;
  const people = Math.min(node.length, present.length, mood.length);
  for (let person = 0; person < people; person++) {
    if (present[person] !== 1) continue;
    const at = node[person]!;
    if (at < 0 || at >= seen.length) continue;
    seen[at]! += 1;
    footfall.mood[at]! += mood[person]!;
  }
}

// Once a simulated day, so the map shows the last few days rather than the whole run: a path
// rerouted last week must stop glowing.
export function fadeFootfall(footfall: Footfall): void {
  for (let at = 0; at < footfall.seen.length; at++) {
    footfall.seen[at]! *= 0.5;
    footfall.mood[at]! *= 0.5;
  }
}

// By the busiest node: the question is where, relatively, not how many.
export function footfallValues(footfall: Footfall): Float32Array {
  const { seen } = footfall;
  let most = 0;
  for (const count of seen) most = Math.max(most, count);
  const values = new Float32Array(seen.length);
  for (let at = 0; at < seen.length; at++) {
    values[at] = seen[at]! > 0 ? seen[at]! / most : Number.NaN;
  }
  return values;
}

// Inverted, so the ramp's bad end is unhappy as it is for every other layer.
export function moodValues(footfall: Footfall): Float32Array {
  const { seen, mood } = footfall;
  const values = new Float32Array(seen.length);
  for (let at = 0; at < seen.length; at++) {
    values[at] = seen[at]! >= MIN_SEEN ? 1 - mood[at]! / seen[at]! : Number.NaN;
  }
  return values;
}

// Unreachable is as bad as it gets, not a lack of data.
export function reachValues(hops: Int32Array, tooFar: number): Float32Array {
  const values = new Float32Array(hops.length);
  for (let at = 0; at < hops.length; at++) {
    const hop = hops[at]!;
    values[at] = hop < 0 ? 1 : Math.min(1, hop / tooFar);
  }
  return values;
}

export interface TileGrid {
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly value: Float32Array;
}

// Scenery passes -1, so a plain tile is the bad end; litter passes +1.
export function gridValues(
  grid: TileGrid,
  tileOf: (node: number) => { readonly tileX: number; readonly tileZ: number },
  nodes: number,
  sign: 1 | -1,
): Float32Array {
  const values = new Float32Array(Math.max(0, nodes));
  for (let at = 0; at < values.length; at++) {
    const { tileX, tileZ } = tileOf(at);
    const inside = tileX >= 0 && tileZ >= 0 && tileX < grid.tilesX && tileZ < grid.tilesZ;
    const value = inside ? grid.value[tileZ * grid.tilesX + tileX]! : Number.NaN;
    values[at] = sign === 1 ? value : 1 - value;
  }
  return values;
}

export interface OverlaySources {
  readonly footfall: Footfall;
  readonly nodes: number;
  readonly tileOf: (node: number) => { readonly tileX: number; readonly tileZ: number };
  // A function, so only the sweep a layer asks for is run.
  readonly hopsTo: (need: GuestNeed) => Int32Array;
  // Step-free from the gates is 0, stairs only 1, so the ramp's bad end is where a wheelchair stops.
  readonly stepFree: () => Float32Array;
  readonly scenery: TileGrid;
  readonly litter: TileGrid;
}

const REACH_NEEDS: { readonly [kind in OverlayKind]?: GuestNeed } = {
  'reach-food': 'hunger',
  'reach-drink': 'thirst',
  'reach-wash': 'hygiene',
};

export function overlayValuesFor(kind: OverlayKind, sources: OverlaySources): Float32Array {
  const need = REACH_NEEDS[kind];
  if (need) return reachValues(sources.hopsTo(need), TOO_FAR_HOPS);
  if (kind === 'step-free') return sources.stepFree();
  if (kind === 'footfall') return footfallValues(sources.footfall);
  if (kind === 'mood') return moodValues(sources.footfall);
  const scenery = kind === 'scenery';
  const grid = scenery ? sources.scenery : sources.litter;
  return gridValues(grid, sources.tileOf, sources.nodes, scenery ? -1 : 1);
}
