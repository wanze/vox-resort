/**
 * The piers the bay's craft have to steer around, as boxes on the water.
 *
 * A sea lane carries on past the tideline as a jetty — see `PIER_TILES` in
 * `resortGenerator.ts` — and six tiles of it reach further out than the line of
 * buoys and the clear water outside it, so the end of every pier is in water the
 * boats are allowed into. Nothing else built on the plot is: the layout refuses
 * anything standing in the sea, and a pier is the paving that is let in anyway.
 *
 * A pier is laid a tile at a time, so it is found a tile at a time — every paved
 * tile at or past its own column's tideline — and then merged into one box per
 * unbroken run down a column. Two lanes make two boxes, which is what keeps the
 * per-frame test in `flotilla.ts` a loop over a couple of rectangles.
 */

import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { waterStartZ, type Shore } from '../../layout/domain/shoreline';

/** A rectangle of water nothing may sail into, in voxels. */
export interface PierBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** The part of a paved tile this needs: where it is. */
export interface PavedSpot {
  readonly tileX: number;
  readonly tileZ: number;
}

/** Every pier on the plot, one box per unbroken run of decking down a column. */
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
