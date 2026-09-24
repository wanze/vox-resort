import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { PIECE, type Litter } from '../../sim/domain/litter';
import { mix } from '../../sim/domain/night';

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

// Hashed from the tile and the piece, not drawn, so a redraw leaves every piece where it lay.
export function piecesFor(
  litter: Litter,
  nodeOnTile: (tileX: number, tileZ: number) => { readonly y: number } | null,
  capacity: number,
  variants: number,
): LitterPiece[] {
  const pieces: LitterPiece[] = [];
  const kinds = Math.max(1, variants);
  for (let tile = 0; tile < litter.level.length && pieces.length < capacity; tile++) {
    const level = litter.level[tile]!;
    if (level <= 0) continue;
    const tileX = tile % litter.tilesX;
    const tileZ = Math.floor(tile / litter.tilesX);
    const node = nodeOnTile(tileX, tileZ);
    if (!node) continue;
    const count = Math.min(MOST_PER_TILE, Math.ceil(level / PIECE));
    for (let piece = 0; piece < count && pieces.length < capacity; piece++) {
      const hash = mix(tile * MOST_PER_TILE + piece + 1);
      pieces.push({
        x: tileX * TILE_VOXELS + INSET + (hash % SPAN),
        y: node.y,
        z: tileZ * TILE_VOXELS + INSET + ((hash >>> 8) % SPAN),
        variant: (hash >>> 16) % kinds,
        turns: (hash >>> 24) % 4,
      });
    }
  }
  return pieces;
}
