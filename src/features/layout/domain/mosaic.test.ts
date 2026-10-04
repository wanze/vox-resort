import { describe, expect, it } from 'vitest';
import { MOSAIC_PIECES } from '../../../../voxel-gen/mosaics/pieces.ts';
import { MOSAIC_SAMPLE } from '../../../../voxel-gen/mosaics/sample.ts';
import type { MosaicSide } from '../../../../voxel-gen/voxelgen.ts';
import { borderedSides, layMosaic, mosaicFit, turnedSide, type MosaicKit } from './mosaic';
import { derivedKey, place, type LayoutItem, type Placement } from './resortLayout';
import { BOARDWALK_ID, PATH_ID } from './resortPlan';
import { ROTATIONS, type Rotation } from './rotation';
import { CLIMBS } from './stairs';

const SIDES: readonly MosaicSide[] = ['n', 'e', 's', 'w'];

const MASKS: readonly Set<MosaicSide>[] = Array.from(
  { length: 16 },
  (_, mask) => new Set(SIDES.filter((_side, bit) => (mask & (1 << bit)) !== 0)),
);

const turned = (borders: readonly MosaicSide[], rotation: Rotation): Set<MosaicSide> =>
  new Set(borders.map((side) => turnedSide(side, rotation)));

const same = (a: ReadonlySet<MosaicSide>, b: ReadonlySet<MosaicSide>): boolean =>
  a.size === b.size && [...a].every((side) => b.has(side));

const item = (id: string): LayoutItem => ({ id, tilesX: 1, tilesZ: 1, width: 16, depth: 16 });

const kit: MosaicKit = {
  styleOf: (id) => (id.startsWith('tiles-') ? 'tiles' : null),
  pieceFor(style, bordered) {
    const fit = mosaicFit(bordered, MOSAIC_PIECES);
    return (
      fit && { item: item(`${style}-${MOSAIC_PIECES[fit.piece]!.name}`), rotation: fit.rotation }
    );
  },
};

const path = (x: number, z: number, id = PATH_ID): Placement =>
  place(item(id), derivedKey(id, x, z), x, z);

describe('mosaicFit', () => {
  it('fits each of the sixteen neighbour masks with one piece, at its lowest turn', () => {
    for (const mask of MASKS) {
      const fits = MOSAIC_PIECES.filter((piece) =>
        ROTATIONS.some((rotation) => same(turned(piece.borders, rotation), mask)),
      );
      expect(fits.length).toBe(1);
      const fit = mosaicFit(mask, MOSAIC_PIECES)!;
      const piece = MOSAIC_PIECES[fit.piece]!;
      expect(same(turned(piece.borders, fit.rotation), mask)).toBe(true);
      const lowest = ROTATIONS.find((rotation) => same(turned(piece.borders, rotation), mask));
      expect(fit.rotation).toBe(lowest);
      if (mask.size === 4) expect([piece.name, fit.rotation]).toEqual(['single', 0]);
      if (mask.size === 0) expect([piece.name, fit.rotation]).toEqual(['centre', 0]);
      if (piece.name === 'strip') expect(fit.rotation).toBeLessThanOrEqual(1);
    }
  });

  it('answers nothing when the style has no piece for the mask', () => {
    const centreOnly = MOSAIC_PIECES.filter((piece) => piece.borders.length === 0);
    expect(mosaicFit(new Set(['n']), centreOnly)).toBeNull();
  });
});

const towards = ({ dx, dz }: { dx: number; dz: number }): MosaicSide =>
  dz < 0 ? 'n' : dz > 0 ? 's' : dx < 0 ? 'w' : 'e';

describe('turnedSide', () => {
  it('turns north to face the way a flight of the same turn climbs', () => {
    for (const climb of CLIMBS) expect(turnedSide('n', climb.rotation)).toBe(towards(climb));
  });
});

describe('borderedSides', () => {
  it('borders on another style, a plain path and bare ground alike', () => {
    const around: Record<string, string | null> = { '1,0': 'tiles', '2,1': 'other', '1,2': null };
    const styleAt = (x: number, z: number): string | null => around[`${x},${z}`] ?? null;
    expect(borderedSides({ x: 1, z: 1 }, 'tiles', styleAt)).toEqual(new Set(['e', 's', 'w']));
  });

  it('lays the mosaic sheet by the same rule the game does', () => {
    const laid = new Set(MOSAIC_SAMPLE.map((cell) => `${cell.x},${cell.z}`));
    const styleAt = (x: number, z: number): string | null => (laid.has(`${x},${z}`) ? 's' : null);
    for (const cell of MOSAIC_SAMPLE) {
      const fit = mosaicFit(borderedSides(cell, 's', styleAt), MOSAIC_PIECES)!;
      expect({ ...cell, piece: MOSAIC_PIECES[fit.piece]!.name, turns: fit.rotation }).toEqual(cell);
    }
  });
});

describe('layMosaic', () => {
  const block = Array.from({ length: 9 }, (_, index) => path(index % 3, Math.floor(index / 3)));

  it('frames a 3 x 3 block with corners and edges round a centre, each turned to its side', () => {
    const laid = layMosaic(block, () => 'tiles', kit);
    expect(laid.map((one) => [one.id, one.rotation])).toEqual([
      ['tiles-corner', 0],
      ['tiles-edge', 0],
      ['tiles-corner', 3],
      ['tiles-edge', 1],
      ['tiles-centre', 0],
      ['tiles-edge', 3],
      ['tiles-corner', 1],
      ['tiles-edge', 2],
      ['tiles-corner', 2],
    ]);
    expect(laid[4]!.key).toBe(derivedKey('tiles-centre', 1, 1));
    expect(laid.map((one) => [one.tileX, one.tileZ, one.y])).toEqual(
      block.map((one) => [one.tileX, one.tileZ, one.y]),
    );
  });

  it('leaves other paving and unchosen paths alone, in the order it was given', () => {
    const paths = [path(5, 5, BOARDWALK_ID), ...block, path(9, 9)];
    const laid = layMosaic(paths, (x) => (x < 3 ? 'tiles' : null), kit);
    expect(laid.length).toBe(paths.length);
    expect(laid[0]).toBe(paths[0]);
    expect(laid.at(-1)).toBe(paths.at(-1));
  });

  it('counts a tile already laid in the style as inside', () => {
    const paths = [path(0, 0), path(1, 0, 'tiles-centre')];
    const laid = layMosaic(paths, (x) => (x === 0 ? 'tiles' : null), kit);
    expect([laid[0]!.id, laid[0]!.rotation]).toEqual(['tiles-end', 1]);
    expect(laid[1]).toBe(paths[1]);
  });
});
