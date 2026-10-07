import { OBJECT_TYPES } from '../../catalog/domain/objectTypes';
import { fitsWorld } from '../../land/domain/landRights';
import type { Placement } from '../../layout/domain/resortLayout';
import { rotateExtent, type Extent } from '../../layout/domain/rotation';
import type { SavedWorld } from '../../resort-prep/domain/savedWorld';

const TILES: ReadonlyMap<string, Extent> = new Map(
  OBJECT_TYPES.map((type) => [type.id, type.model.tiles]),
);

// A bad link needs no full list, and a hand-made one could hold thousands.
const MOST_MISFITS = 10;

function footprintMisfit(entry: Placement): string | null {
  const tiles = TILES.get(entry.id);
  if (!tiles) return `${entry.key}: no object is called ${entry.id}`;
  const turned = rotateExtent(tiles.x, tiles.z, entry.rotation);
  return turned.x === entry.tilesX && turned.z === entry.tilesZ
    ? null
    : `${entry.key}: ${entry.tilesX}x${entry.tilesZ} where its model takes ${turned.x}x${turned.z}`;
}

const inside = (entry: Placement, world: SavedWorld): boolean =>
  entry.tileX >= 0 &&
  entry.tileZ >= 0 &&
  entry.tileX + entry.tilesX <= world.tilesX &&
  entry.tileZ + entry.tilesZ <= world.tilesZ;

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

// Saves never needed this, as only the game writes them; a link can be edited by hand. Terrain
// edits are left alone: they rightly reach past the plot into the sea.
export function worldMisfits(world: SavedWorld): readonly string[] {
  const misfits: string[] = [];
  const claimed = new Uint8Array(world.tilesX * world.tilesZ);
  // Rails are left out of the claims: a rail stands on the paving it guards.
  const lists = [
    { list: world.placements, claiming: true },
    { list: world.props, claiming: true },
    { list: world.paths, claiming: true },
    { list: world.rails, claiming: false },
  ];
  for (const { list, claiming } of lists) {
    for (const entry of list) {
      if (misfits.length >= MOST_MISFITS) return misfits;
      const footprint = footprintMisfit(entry);
      if (footprint !== null) misfits.push(footprint);
      else if (!inside(entry, world)) misfits.push(`${entry.key}: off the plot`);
      else if (claiming && claims(entry, world, claimed)) misfits.push(`${entry.key}: overlaps`);
    }
  }
  if (world.land && !fitsWorld(world.land, world) && misfits.length < MOST_MISFITS) {
    misfits.push('a land grid of another size');
  }
  return misfits;
}
