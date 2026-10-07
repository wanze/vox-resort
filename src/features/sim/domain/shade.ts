import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { Placement } from '../../layout/domain/resortLayout';

export interface ShadeMap {
  readonly tilesX: number;
  // Row-major, tileZ * tilesX + tileX, as a beach pitch keys its tile.
  readonly tiles: ReadonlySet<number>;
}

export function shadeMapOf(
  placements: readonly Placement[],
  shades: (id: string) => boolean,
  tilesX: number,
): ShadeMap {
  const tiles = new Set<number>();
  for (const placement of placements) {
    if (!shades(placement.id)) continue;
    for (let dz = 0; dz < placement.tilesZ; dz++) {
      for (let dx = 0; dx < placement.tilesX; dx++) {
        tiles.add((placement.tileZ + dz) * tilesX + placement.tileX + dx);
      }
    }
  }
  return { tilesX, tiles };
}

export function shadedAt(shade: ShadeMap | null, x: number, z: number): boolean {
  if (!shade || shade.tiles.size === 0) return false;
  const tileX = Math.floor(x / TILE_VOXELS);
  const tileZ = Math.floor(z / TILE_VOXELS);
  if (tileX < 0 || tileZ < 0 || tileX >= shade.tilesX) return false;
  return shade.tiles.has(tileZ * shade.tilesX + tileX);
}
