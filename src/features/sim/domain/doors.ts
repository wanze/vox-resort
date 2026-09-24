import type { NodeIndex } from '../../crowd/domain/nearestNode';
import { blockedAt } from '../../crowd/domain/sandGrid';
import type { WalkNetwork } from '../../crowd/domain/walkNetwork';
import { doorStepTile } from '../../layout/domain/doorStep';
import { terrainAt } from '../../layout/domain/shoreline';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { Venue } from './venues';

export interface VenueDoors {
  // Sorted: source order breaks ties in the flow field, and the sweep must come out the same twice.
  readonly nodes: readonly number[];
  readonly declared: boolean;
  readonly sand: readonly { readonly x: number; readonly z: number }[];
}

type DoorFootprint = Pick<Venue, 'tileX' | 'tileZ' | 'tilesX' | 'tilesZ' | 'doors'>;

type SandGround = Pick<WalkNetwork, 'beach' | 'sand'>;

export function doorsFor(
  venue: DoorFootprint,
  index: NodeIndex,
  ground: SandGround | null = null,
): VenueDoors {
  const sand = sandDoorsFor(venue, ground);
  const found = new Set<number>();
  for (const door of venue.doors) {
    const tile = doorStepTile(venue, door);
    for (const node of index.at(tile.x, tile.z) ?? []) found.add(node);
  }
  if (found.size > 0) return { nodes: sorted(found), declared: true, sand };
  return { nodes: ringNodes(venue, index), declared: false, sand };
}

// The ring fallback must stay: a queue in the wrong place is a blemish, but a building nobody can
// reach silently stops working.
function ringNodes(venue: DoorFootprint, index: NodeIndex): readonly number[] {
  const found = new Set<number>();
  for (let tileX = venue.tileX - 1; tileX <= venue.tileX + venue.tilesX; tileX++) {
    for (let tileZ = venue.tileZ - 1; tileZ <= venue.tileZ + venue.tilesZ; tileZ++) {
      for (const node of index.at(tileX, tileZ) ?? []) found.add(node);
    }
  }
  return sorted(found);
}

const sorted = (nodes: ReadonlySet<number>): readonly number[] =>
  [...nodes].toSorted((a, b) => a - b);

// Only a venue anchored on the beach band counts: the band is the only sand anybody walks.
function sandDoorsFor(
  venue: DoorFootprint,
  ground: SandGround | null,
): readonly { readonly x: number; readonly z: number }[] {
  const shore = ground?.beach?.shore ?? null;
  if (!ground || terrainAt(shore, venue.tileX, venue.tileZ) !== 'beach') return [];
  const open = (tile: { readonly x: number; readonly z: number }): boolean =>
    terrainAt(shore, tile.x, tile.z) === 'beach' &&
    !(ground.sand && blockedAt(ground.sand, centre(tile.x), centre(tile.z)));

  const declared = uniqueTiles(venue.doors.map((door) => doorStepTile(venue, door))).filter(open);
  const tiles = declared.length > 0 ? declared : ringTiles(venue).filter(open);
  return tiles.map((tile) => ({ x: centre(tile.x), z: centre(tile.z) }));
}

function ringTiles(venue: DoorFootprint): { readonly x: number; readonly z: number }[] {
  const tiles: { x: number; z: number }[] = [];
  for (let x = venue.tileX - 1; x <= venue.tileX + venue.tilesX; x++) {
    for (let z = venue.tileZ - 1; z <= venue.tileZ + venue.tilesZ; z++) {
      const inside =
        x >= venue.tileX &&
        x < venue.tileX + venue.tilesX &&
        z >= venue.tileZ &&
        z < venue.tileZ + venue.tilesZ;
      if (!inside) tiles.push({ x, z });
    }
  }
  return tiles;
}

function uniqueTiles(
  tiles: readonly { readonly x: number; readonly z: number }[],
): { readonly x: number; readonly z: number }[] {
  const seen = new Set<string>();
  return tiles.filter((tile) => {
    const key = `${tile.x},${tile.z}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const centre = (tile: number): number => (tile + 0.5) * TILE_VOXELS;
