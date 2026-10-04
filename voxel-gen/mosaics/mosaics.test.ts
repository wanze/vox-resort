import { describe, expect, it } from 'vitest';
import { buildModel, TILE_VOXELS, type Color, type VoxelModel } from '../voxelgen.ts';
import { MOSAIC_IDS, MOSAIC_MODELS, MOSAIC_STYLES, MOSAIC_VARIANTS } from './index.ts';
import {
  BAND,
  MOSAIC_COST,
  MOSAIC_PIECES,
  MOSAIC_SCENERY,
  mosaicSources,
  turnVoxel,
  withinBand,
} from './pieces.ts';

const topOf = (model: VoxelModel): Color[][] => {
  const top: Color[][] = Array.from({ length: TILE_VOXELS }, () => []);
  for (const voxel of model.voxels) if (voxel.y === 1) top[voxel.x]![voxel.z] = voxel.color;
  return top;
};

const cells = Array.from({ length: TILE_VOXELS * TILE_VOXELS }, (_, index) => ({
  x: index % TILE_VOXELS,
  z: Math.floor(index / TILE_VOXELS),
}));

const piecesOf = (style: (typeof MOSAIC_STYLES)[number]) =>
  mosaicSources(style).map((source) => buildModel(source));

const centreOf = (models: readonly VoxelModel[]): VoxelModel =>
  models.find((model) => model.mosaic!.borders.length === 0)!;

describe('mosaic pieces', () => {
  it('turns the north row onto the west column', () => {
    for (let x = 0; x < TILE_VOXELS; x++) expect(turnVoxel(x, 0, 1).x).toBe(0);
    expect(turnVoxel(0, 0, 1)).toEqual({ x: 0, z: TILE_VOXELS - 1 });
  });

  it('draws every field so a quarter turn leaves it as it was', () => {
    for (const style of MOSAIC_STYLES) {
      const top = topOf(centreOf(piecesOf(style)));
      for (const { x, z } of cells) {
        const turned = turnVoxel(x, z, 1);
        expect(top[turned.x]![turned.z], `${style.id} ${x},${z}`).toBe(top[x]![z]);
      }
    }
  });

  it('shows the centre field everywhere a declared border does not reach', () => {
    for (const style of MOSAIC_STYLES) {
      const pieces = piecesOf(style);
      const centre = topOf(centreOf(pieces));
      for (const piece of pieces) {
        const top = topOf(piece);
        for (const cell of cells) {
          if (piece.mosaic!.borders.some((side) => withinBand(side, cell))) continue;
          expect(top[cell.x]![cell.z], `${piece.id} ${cell.x},${cell.z}`).toBe(
            centre[cell.x]![cell.z],
          );
        }
      }
    }
  });

  it('lays a band of the border colour along every declared side', () => {
    for (const style of MOSAIC_STYLES) {
      for (const piece of piecesOf(style)) {
        const top = topOf(piece);
        for (const side of piece.mosaic!.borders) {
          const banded = cells.filter((cell) => withinBand(side, cell));
          expect(banded.length).toBe(BAND * TILE_VOXELS);
          for (const cell of banded) expect(top[cell.x]![cell.z], piece.id).toBe(style.border);
        }
      }
    }
  });

  it('gives each style one piece per border set, its own model being the single', () => {
    for (const style of MOSAIC_STYLES) {
      const pieces = piecesOf(style);
      expect(pieces.map((piece) => piece.mosaic!.borders)).toEqual(
        MOSAIC_PIECES.map((piece) => piece.borders),
      );
      expect(pieces[0]!.id).toBe(style.id);
      for (const piece of pieces) expect(piece.mosaic!.style).toBe(style.id);
    }
    expect(MOSAIC_IDS.length).toBe(MOSAIC_STYLES.length * MOSAIC_PIECES.length);
    expect(MOSAIC_MODELS.length + MOSAIC_VARIANTS.length).toBe(MOSAIC_IDS.length);
  });

  it('lays a paving tile priced and dressed alike, offering only the styles', () => {
    const styles = new Set(MOSAIC_STYLES.map((style) => style.id));
    for (const style of MOSAIC_STYLES) {
      for (const source of mosaicSources(style)) {
        const model = buildModel(source);
        expect([model.width, model.height, model.depth], model.id).toEqual([16, 2, 16]);
        expect(model.tiles).toEqual({ x: 1, z: 1 });
        expect(model.cost).toBe(MOSAIC_COST);
        expect(model.scenery).toBe(MOSAIC_SCENERY);
        expect(model.sound).toBeNull();
        expect(model.groundDecides, model.id).toBe(!styles.has(model.id));
      }
    }
  });
});
