import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { createLitter, PIECE, type Litter } from '../../sim/domain/litter';
import { piecesFor } from './litterPieces';

const everywhere = (): { y: number } => ({ y: 3 });

const fouled = (): Litter => {
  const litter = createLitter(4, 3);
  litter.level.set([0, PIECE, 0, 1, 0, 0.75, 0, 0, 0.5, 0, 0, 1]);
  return litter;
};

describe('piecesFor', () => {
  it('lays one piece per share of litter on a tile, four at most', () => {
    const litter = createLitter(2, 1);
    litter.level.set([PIECE, 1]);
    const pieces = piecesFor(litter, everywhere, 100, 2);
    expect(pieces).toHaveLength(5);
    expect(pieces.every((piece) => piece.y === 3)).toBe(true);
  });

  it('lays the same pieces in the same places for the same grid', () => {
    expect(piecesFor(fouled(), everywhere, 100, 3)).toEqual(
      piecesFor(fouled(), everywhere, 100, 3),
    );
  });

  it('never lays more than it has room for', () => {
    expect(piecesFor(fouled(), everywhere, 5, 2)).toHaveLength(5);
    expect(piecesFor(fouled(), everywhere, 0, 2)).toEqual([]);
  });

  it('lays nothing on clean paths, or where no node stands', () => {
    expect(piecesFor(createLitter(4, 4), everywhere, 100, 2)).toEqual([]);
    expect(piecesFor(fouled(), () => null, 100, 2)).toEqual([]);
  });

  it('keeps every piece inside its own tile, and a variant that exists', () => {
    const litter = createLitter(6, 6);
    litter.level.fill(1);
    const pieces = piecesFor(litter, everywhere, 1000, 2);
    expect(pieces).toHaveLength(6 * 6 * 4);
    for (const [index, piece] of pieces.entries()) {
      const tile = Math.floor(index / 4);
      const left = (tile % 6) * TILE_VOXELS;
      const top = Math.floor(tile / 6) * TILE_VOXELS;
      expect(piece.x).toBeGreaterThanOrEqual(left + 1);
      expect(piece.x).toBeLessThanOrEqual(left + TILE_VOXELS - 1);
      expect(piece.z).toBeGreaterThanOrEqual(top + 1);
      expect(piece.z).toBeLessThanOrEqual(top + TILE_VOXELS - 1);
      expect([0, 1]).toContain(piece.variant);
      expect(piece.turns).toBeLessThan(4);
    }
  });
});
