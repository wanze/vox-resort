import { describe, expect, it } from 'vitest';
import { MOSAIC_STYLES } from '../../../../voxel-gen/mosaics/index.ts';
import type { MosaicSide } from '../../../../voxel-gen/voxelgen.ts';
import type { LayoutItem } from '../../layout/domain/resortLayout';
import { place, type Placement } from '../../layout/domain/resortLayout';
import type { ResortPlan } from '../../layout/domain/resortPlan';
import { mosaicDressing, mosaicKitOf } from './mosaics';
import { sceneryAt, sceneryFieldFor } from '../../sim/domain/scenery';
import { mosaicOf, OBJECT_TYPES, sceneryOf } from './objectTypes';

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

describe('mosaicKitOf', () => {
  const kit = mosaicKitOf(ITEMS);

  it('answers every neighbour mask in every style with a piece of that style', () => {
    for (const style of MOSAIC_STYLES) {
      for (const mask of MASKS) {
        const fit = kit.pieceFor(style.id, mask);
        expect(fit, `${style.id} ${[...mask].join()}`).not.toBeNull();
        expect(mosaicOf(fit!.item.id)!.style).toBe(style.id);
      }
    }
    expect(kit.pieceFor('mosaic', new Set(SIDES))!.item.id).toBe('mosaic');
  });

  it('names the style of a piece and of a style, and none for a plain path', () => {
    expect(kit.styleOf('mosaic-calcada-edge')).toBe('mosaic-calcada');
    expect(kit.styleOf('mosaic-zellige')).toBe('mosaic-zellige');
    expect(kit.styleOf('mosaic-centre')).toBe('mosaic');
    expect(kit.styleOf('path')).toBeNull();
  });
});

describe('mosaic scenery', () => {
  // Paving is dense, so a resort paved wall to wall in mosaic must stay under half of what
  // scenery can give, or it would outweigh every fountain and garden on the plot.
  it('keeps a plot paved wall to wall below half the setting scenery can give', () => {
    const size = 21;
    const tiles = Array.from({ length: size * size }, (_, index) => ({
      tileX: index % size,
      tileZ: Math.floor(index / size),
      tilesX: 1,
      tilesZ: 1,
      strength: sceneryOf('mosaic'),
    }));
    const centre = sceneryAt(sceneryFieldFor(tiles, size, size), 10, 10);
    expect(centre).toBeGreaterThan(0.4);
    expect(centre).toBeLessThan(0.5);
  });
});

const standing = (id: string, tileX: number, tileZ: number, tiles = 1): Placement =>
  place(
    { id, tilesX: tiles, tilesZ: tiles, width: 16 * tiles, depth: 16 * tiles },
    id,
    tileX,
    tileZ,
  );

const PLAN: ResortPlan = {
  tilesX: 40,
  tilesZ: 40,
  plots: [],
  nodes: [],
  edges: [],
  plazas: [
    { x0: 10, x1: 13, z0: 10, z1: 13 },
    { x0: 20, x1: 23, z0: 20, z1: 23 },
    { x0: 2, x1: 5, z0: 30, z1: 33 },
  ],
  parks: [{ x0: 0, x1: 8, z0: 28, z1: 36 }],
};

const STANDING = [
  standing('fountain-b', 11, 11, 2),
  standing('statue', 30, 5),
  standing('fountain', 3, 31, 2),
];

describe('mosaicDressing', () => {
  const styleAt = mosaicDressing(PLAN, STANDING, 1);
  const styles = new Set(MOSAIC_STYLES.map((style) => style.id));

  it('paves a park and a plaza that holds a fountain, in any style', () => {
    expect(styles.has(styleAt(0, 28)!)).toBe(true);
    expect(styles.has(styleAt(10, 13)!)).toBe(true);
    expect(styleAt(20, 20)).toBeNull();
  });

  it('paves one tile round a statue, and no further', () => {
    expect(styles.has(styleAt(29, 4)!)).toBe(true);
    expect(styles.has(styleAt(31, 6)!)).toBe(true);
    expect(styleAt(28, 5)).toBeNull();
    expect(styleAt(15, 15)).toBeNull();
  });

  it('paves a fountain in a park in the park style, the same each time it is asked', () => {
    expect(styleAt(3, 30)).toBe(styleAt(8, 36));
    expect(mosaicDressing(PLAN, STANDING, 1)(10, 13)).toBe(styleAt(10, 13));
  });

  it('picks the style by seed, so plots differ', () => {
    const picked = new Set(
      Array.from({ length: 12 }, (_, seed) => mosaicDressing(PLAN, STANDING, seed)(0, 28)),
    );
    expect(picked.size).toBeGreaterThan(1);
  });
});
