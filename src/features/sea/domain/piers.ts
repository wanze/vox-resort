import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { waterStartZ, type Shore } from '../../layout/domain/shoreline';

export interface PierBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface PavedSpot {
  readonly tileX: number;
  readonly tileZ: number;
}

export function pierBoxesFor(shore: Shore | null, paved: readonly PavedSpot[]): PierBox[] {
  if (!shore) return [];
  const overWater = paved
    .filter((tile) => tile.tileZ >= waterStartZ(shore, tile.tileX))
    .toSorted((a, b) => a.tileX - b.tileX || a.tileZ - b.tileZ);

  const boxes: PierBox[] = [];
  let run: { tileX: number; first: number; last: number } | null = null;
  const close = (): void => {
    if (!run) return;
    boxes.push({
      minX: run.tileX * TILE_VOXELS,
      maxX: (run.tileX + 1) * TILE_VOXELS,
      minZ: run.first * TILE_VOXELS,
      maxZ: (run.last + 1) * TILE_VOXELS,
    });
  };
  for (const tile of overWater) {
    if (run && run.tileX === tile.tileX && run.last + 1 === tile.tileZ) {
      run.last = tile.tileZ;
      continue;
    }
    close();
    run = { tileX: tile.tileX, first: tile.tileZ, last: tile.tileZ };
  }
  close();
  return boxes;
}
