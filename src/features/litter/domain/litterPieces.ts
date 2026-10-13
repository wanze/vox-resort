import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { TileRect } from '../../layout/domain/parkShapes';
import { PIECE, windowOf, type Litter } from '../../sim/domain/litter';
import { mix } from '../../random/domain/hash';

export interface LitterPiece {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly variant: number;
  // Quarter turns, so voxel art stays on the grid it was drawn on.
  readonly turns: number;
}

// Past four pieces a tile reads as fouled already; more would only cost instances.
const MOST_PER_TILE = 4;

// Centres kept this far inside the edge, so a piece three voxels wide never overhangs its tile.
const INSET = 2;

const SPAN = TILE_VOXELS - 2 * INSET + 1;

// Variants by what left them: a cup washed up from the sea would read as a guest's.
export interface LitterKinds {
  readonly dropped: readonly number[];
  readonly washed: readonly number[];
}

const NO_KIND: readonly number[] = [0];

const kindsAt = (kinds: LitterKinds, washed: boolean): readonly number[] => {
  const chosen = washed && kinds.washed.length > 0 ? kinds.washed : kinds.dropped;
  return chosen.length > 0 ? chosen : NO_KIND;
};

// Hashed from the tile and the piece, not drawn, so a redraw leaves every piece where it lay.
export function piecesFor(
  litter: Litter,
  // The height to lay a piece on; null for a tile not to draw.
  groundOf: (tileX: number, tileZ: number) => number | null,
  capacity: number,
  kinds: LitterKinds,
  window?: TileRect,
): LitterPiece[] {
  const pieces: LitterPiece[] = [];
  const { x0, x1, z0, z1 } = windowOf(litter, window);
  for (let tileZ = z0; tileZ <= z1 && pieces.length < capacity; tileZ++) {
    for (let tileX = x0; tileX <= x1 && pieces.length < capacity; tileX++) {
      const tile = tileZ * litter.tilesX + tileX;
      const level = litter.level[tile]!;
      if (level <= 0) continue;
      const y = groundOf(tileX, tileZ);
      if (y === null) continue;
      const count = Math.min(MOST_PER_TILE, Math.ceil(level / PIECE));
      const variants = kindsAt(kinds, litter.washed[tile] === 1);
      for (let piece = 0; piece < count && pieces.length < capacity; piece++) {
        const hash = mix(tile * MOST_PER_TILE + piece + 1);
        pieces.push({
          x: tileX * TILE_VOXELS + INSET + (hash % SPAN),
          y,
          z: tileZ * TILE_VOXELS + INSET + ((hash >>> 8) % SPAN),
          variant: variants[(hash >>> 16) % variants.length]!,
          turns: (hash >>> 24) % 4,
        });
      }
    }
  }
  return pieces;
}
