// Overlapping cushions of whole rectangles, never a dither or random height field: the mesher
// takes each patch whole, where the old dithered bed cost ten hedges.
import { PALETTE } from '../palette.ts';
import { defineModel, type Color, type VoxelBuilder } from '../voxelgen.ts';

const BED = { x0: 2, x1: 13, z0: 2, z1: 13 } as const;

const SOIL = { x0: 3, x1: 12, z0: 3, z1: 12 } as const;

// The lowest course sinks half into the terrain, so three leave a kerb of two and a half.
const WALL_COURSES = 3;

interface Cushion {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly tall: number;
  readonly leaf: Color;
}

// Uneven sizes and heights, the tallest off centre at the back, so the bed reads as plants
// grown together rather than a stepped cake.
const CUSHIONS: readonly Cushion[] = [
  { x0: 3, x1: 7, z0: 3, z1: 6, tall: 3, leaf: PALETTE.foliage.shade },
  { x0: 8, x1: 12, z0: 3, z1: 7, tall: 2, leaf: PALETTE.foliage.base },
  { x0: 3, x1: 6, z0: 7, z1: 12, tall: 2, leaf: PALETTE.foliage.base },
  { x0: 7, x1: 12, z0: 8, z1: 12, tall: 1, leaf: PALETTE.foliage.shade },
  { x0: 6, x1: 9, z0: 6, z1: 9, tall: 2, leaf: PALETTE.foliage.base },
];

// Each sits on the cushion under it; a few overhang its edge, as flowers lean out of a bed.
const BLOOMS: ReadonlyArray<readonly [number, number, number, number, Color]> = [
  [4, 5, 4, 4, PALETTE.bloom.base],
  [6, 6, 5, 5, PALETTE.bloom.light],
  [9, 10, 4, 5, PALETTE.amber.base],
  [11, 11, 6, 6, PALETTE.amber.light],
  [4, 4, 8, 9, PALETTE.stucco.light],
  [5, 5, 11, 11, PALETTE.bloom.base],
  [7, 8, 7, 7, PALETTE.bloom.base],
  [8, 9, 10, 11, PALETTE.amber.base],
  [11, 11, 9, 9, PALETTE.bloom.light],
];

const topOf = (x: number, z: number, from: number): number =>
  CUSHIONS.reduce(
    (top, c) =>
      x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 ? Math.max(top, from + c.tall) : top,
    from,
  );

export default defineModel({
  id: 'flowerbed',
  label: 'Flower Bed',
  category: 'grounds',
  scenery: 0.5,
  tiles: { x: 1, z: 1 },
  onTerrain: true,
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { terracotta, teak } = PALETTE;

    const coping = WALL_COURSES - 1;
    box(BED.x0, BED.x1, 0, coping - 1, BED.z0, BED.z1, terracotta.shade);
    box(BED.x0, BED.x1, coping, coping, BED.z0, BED.z1, terracotta.base);
    box(SOIL.x0, SOIL.x1, coping, coping, SOIL.z0, SOIL.z1, teak.deep);

    const soil = coping + 1;
    for (const c of CUSHIONS) box(c.x0, c.x1, soil, soil + c.tall - 1, c.z0, c.z1, c.leaf);

    for (const [x0, x1, z0, z1, color] of BLOOMS) {
      const y = topOf(x0, z0, soil);
      box(x0, x1, y, y, z0, z1, color);
    }
  },
});
