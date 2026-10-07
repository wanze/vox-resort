import { LEVEL_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { layoutItemFor } from '../../build/domain/buildPlan';
import { OBJECT_TYPES } from '../../catalog/domain/objectTypes';
import { fitsWorld } from '../../land/domain/landRights';
import { elevationFor } from '../../layout/domain/elevation';
import {
  place,
  placeOnEdge,
  type LayoutItem,
  type Placement,
} from '../../layout/domain/resortLayout';
import { rotateExtent } from '../../layout/domain/rotation';
import { MAX_TERRAIN_LEVEL } from '../../layout/domain/terrain';
import { planOfWorld, type SavedWorld } from '../../resort-prep/domain/savedWorld';

const ITEMS: ReadonlyMap<string, LayoutItem> = new Map(
  OBJECT_TYPES.map((type) => [type.id, layoutItemFor(type)]),
);

// A bad link needs no full list, and a hand-made one could hold thousands.
const MOST_MISFITS = 10;

interface Misfits {
  readonly list: readonly string[];
  add(misfit: string | null): void;
  full(): boolean;
}

function misfitCollector(): Misfits {
  const list: string[] = [];
  const full = (): boolean => list.length >= MOST_MISFITS;
  return {
    list,
    add(misfit) {
      if (misfit !== null && !full()) list.push(misfit);
    },
    full,
  };
}

interface Seen {
  readonly keys: Set<string>;
  readonly railEdges: Set<string>;
  readonly claimed: Uint8Array;
}

function footprintMisfit(entry: Placement, item: LayoutItem): string | null {
  const turned = rotateExtent(item.tilesX, item.tilesZ, entry.rotation);
  return turned.x === entry.tilesX && turned.z === entry.tilesZ
    ? null
    : `${entry.key}: ${entry.tilesX}x${entry.tilesZ} where its model takes ${turned.x}x${turned.z}`;
}

function geometryMisfit(entry: Placement, item: LayoutItem, rail: boolean): string | null {
  const want = (rail ? placeOnEdge : place)(
    item,
    entry.key,
    entry.tileX,
    entry.tileZ,
    entry.rotation,
  );
  const same =
    want.x === entry.x &&
    want.z === entry.z &&
    want.width === entry.width &&
    want.depth === entry.depth;
  return same ? null : `${entry.key}: not where its model stands`;
}

// A bound, not the ground under the tile: that would mean building the terrain here.
function heightMisfit(entry: Placement): string | null {
  const levels = entry.y / LEVEL_VOXELS;
  return Number.isInteger(levels) && levels >= 0 && levels <= MAX_TERRAIN_LEVEL
    ? null
    : `${entry.key}: at a height no ground has`;
}

const inside = (entry: Placement, world: SavedWorld): boolean =>
  entry.tileX >= 0 &&
  entry.tileZ >= 0 &&
  entry.tileX + entry.tilesX <= world.tilesX &&
  entry.tileZ + entry.tilesZ <= world.tilesZ;

function firstSighting(seen: Set<string>, id: string): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  return true;
}

function claims(entry: Placement, world: SavedWorld, claimed: Uint8Array): boolean {
  let overlaps = false;
  for (let tileZ = entry.tileZ; tileZ < entry.tileZ + entry.tilesZ; tileZ++) {
    for (let tileX = entry.tileX; tileX < entry.tileX + entry.tilesX; tileX++) {
      const tile = tileZ * world.tilesX + tileX;
      overlaps ||= claimed[tile] === 1;
      claimed[tile] = 1;
    }
  }
  return overlaps;
}

// The game puts up to four rails on a tile, one per edge, never two on one edge.
function railEdgeMisfit(entry: Placement, seen: Seen): string | null {
  const edge = `${entry.tileX},${entry.tileZ},${entry.rotation}`;
  return firstSighting(seen.railEdges, edge) ? null : `${entry.key}: a second rail on one edge`;
}

// Rails are left out of the claims: a rail stands on the paving it guards.
function standingMisfit(
  entry: Placement,
  rail: boolean,
  world: SavedWorld,
  seen: Seen,
): string | null {
  if (!inside(entry, world)) return `${entry.key}: off the plot`;
  if (!firstSighting(seen.keys, entry.key)) return `${entry.key}: a key used twice`;
  if (rail) return railEdgeMisfit(entry, seen);
  return claims(entry, world, seen.claimed) ? `${entry.key}: overlaps` : null;
}

function entryMisfit(entry: Placement, rail: boolean, world: SavedWorld, seen: Seen) {
  const item = ITEMS.get(entry.id);
  if (!item) return `${entry.key}: no object is called ${entry.id}`;
  return (
    footprintMisfit(entry, item) ??
    geometryMisfit(entry, item, rail) ??
    heightMisfit(entry) ??
    standingMisfit(entry, rail, world, seen)
  );
}

function addTerrainMisfits(world: SavedWorld, misfits: Misfits): void {
  const cells = new Set<string>();
  for (const { tileX, tileZ } of world.terrain) {
    if (misfits.full()) return;
    if (!firstSighting(cells, `${tileX},${tileZ}`)) {
      misfits.add(`terrain at ${tileX},${tileZ} edited twice`);
    }
  }
}

function laysTerraces(world: SavedWorld): boolean {
  if (world.elevation === null) return true;
  try {
    elevationFor(planOfWorld(world));
    return true;
  } catch {
    return false;
  }
}

// Saves never needed this, as only the game writes them; a link can be edited by hand. Terrain
// edits may reach past the plot into the sea, but each cell is edited once.
export function worldMisfits(world: SavedWorld): readonly string[] {
  const misfits = misfitCollector();
  const seen: Seen = {
    keys: new Set(),
    railEdges: new Set(),
    claimed: new Uint8Array(world.tilesX * world.tilesZ),
  };
  const lists = [
    { list: world.placements, rail: false },
    { list: world.props, rail: false },
    { list: world.paths, rail: false },
    { list: world.rails, rail: true },
  ];
  for (const { list, rail } of lists) {
    for (const entry of list) {
      if (misfits.full()) return misfits.list;
      misfits.add(entryMisfit(entry, rail, world, seen));
    }
  }
  addTerrainMisfits(world, misfits);
  if (world.land && !fitsWorld(world.land, world)) misfits.add('a land grid of another size');
  if (!laysTerraces(world)) misfits.add('terraces the game cannot lay');
  return misfits.list;
}
