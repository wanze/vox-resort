import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { AROUND, type Terrain } from '../../layout/domain/terrain';
import { tileKey } from '../../layout/domain/tileKey';
import type { PierBox } from './piers';

interface Tile {
  readonly x: number;
  readonly z: number;
}

function raisedSeaOf(terrain: Pick<Terrain, 'edits' | 'isSea'>): Map<string, Tile> {
  const raised = new Map<string, Tile>();
  for (const edit of terrain.edits) {
    if (edit.level <= 0 || !terrain.isSea(edit.tileX, edit.tileZ)) continue;
    raised.set(tileKey(edit.tileX, edit.tileZ), { x: edit.tileX, z: edit.tileZ });
  }
  return raised;
}

// Diagonals count: a boat cannot squeeze between two tiles that touch at a corner.
function islandAt(start: Tile, raised: ReadonlyMap<string, Tile>, seen: Set<string>): Tile[] {
  const island: Tile[] = [];
  const queue = [start];
  seen.add(tileKey(start.x, start.z));
  for (let tile = queue.pop(); tile; tile = queue.pop()) {
    island.push(tile);
    for (const [dx, dz] of AROUND) {
      const key = tileKey(tile.x + dx, tile.z + dz);
      const next = raised.get(key);
      if (!next || seen.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return island;
}

function boxOf(island: readonly Tile[]): PierBox {
  const xs = island.map((tile) => tile.x);
  const zs = island.map((tile) => tile.z);
  return {
    minX: Math.min(...xs) * TILE_VOXELS,
    maxX: (Math.max(...xs) + 1) * TILE_VOXELS,
    minZ: Math.min(...zs) * TILE_VOXELS,
    maxZ: (Math.max(...zs) + 1) * TILE_VOXELS,
  };
}

// One box round each island, not one per tile: a boat shoved out of one tile's box would only land
// in the next, and be shoved back.
export function islandBoxesFor(terrain: Pick<Terrain, 'edits' | 'isSea'>): PierBox[] {
  const raised = raisedSeaOf(terrain);
  const seen = new Set<string>();
  const boxes: PierBox[] = [];
  for (const [key, tile] of raised) {
    if (!seen.has(key)) boxes.push(boxOf(islandAt(tile, raised, seen)));
  }
  return boxes;
}
