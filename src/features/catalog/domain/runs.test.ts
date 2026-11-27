import { describe, expect, it } from 'vitest';
import { RUN_MODELS, RUN_STYLES } from '../../../../voxel-gen/runs/index.ts';
import { turnVoxel } from '../../../../voxel-gen/mosaics/pieces.ts';
import { buildModel, TILE_VOXELS, type MosaicSide } from '../../../../voxel-gen/voxelgen.ts';
import type { LayoutItem } from '../../layout/domain/resortLayout';
import { OBJECT_TYPES, runOf } from './objectTypes';
import { runKitOf } from './runs';

const ITEMS: readonly LayoutItem[] = OBJECT_TYPES.map((type) => ({
  id: type.id,
  tilesX: type.model.tiles.x,
  tilesZ: type.model.tiles.z,
  width: type.model.width,
  depth: type.model.depth,
}));

const SIDES: readonly MosaicSide[] = ['n', 'e', 's', 'w'];

const MASKS = Array.from(
  { length: 16 },
  (_, mask) => new Set(SIDES.filter((_side, bit) => (mask & (1 << bit)) !== 0)),
);

const LAST = TILE_VOXELS - 1;

const MODELS = new Map(RUN_MODELS.map((source) => [source.id, buildModel(source)]));

// The sides the piece's voxels reach once turned the way the kit lays it.
function reachedSides(id: string, rotation: 0 | 1 | 2 | 3): Set<MosaicSide> {
  const reached = new Set<MosaicSide>();
  for (const { x, z } of MODELS.get(id)!.voxels) {
    const cell = turnVoxel(x, z, rotation);
    if (cell.z === 0) reached.add('n');
    if (cell.z === LAST) reached.add('s');
    if (cell.x === 0) reached.add('w');
    if (cell.x === LAST) reached.add('e');
  }
  return reached;
}

describe('runKitOf', () => {
  const kit = runKitOf(ITEMS);

  it('meets the tile edge on exactly the sides each neighbour mask joins, in every style', () => {
    for (const style of RUN_STYLES) {
      for (const mask of MASKS) {
        const fit = kit.pieceFor(style.id, mask, 0)!;
        expect(runOf(fit.item.id)!.style).toBe(style.id);
        expect(reachedSides(fit.item.id, fit.rotation), `${style.id} ${[...mask]}`).toEqual(mask);
      }
    }
  });

  it('paints every straight length alike from either end, so a turned piece meets its neighbour', () => {
    for (const style of RUN_STYLES) {
      const voxels = MODELS.get(style.id)!.voxels;
      const painted = new Map(voxels.map(({ x, y, z, color }) => [`${x},${y},${z}`, color]));
      for (const { x, y, z } of voxels) {
        expect(painted.get(`${LAST - x},${y},${LAST - z}`), `${style.id} ${x},${y},${z}`).toBe(
          painted.get(`${x},${y},${z}`),
        );
      }
    }
  });

  it('names the style of every piece, and none for what is not a run', () => {
    expect(kit.styleOf('hedge-corner')).toBe('hedge');
    expect(kit.styleOf('stone-wall')).toBe('stone-wall');
    expect(kit.styleOf('street-lamp')).toBeNull();
  });
});
