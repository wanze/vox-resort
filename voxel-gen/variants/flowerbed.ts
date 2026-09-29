// Flat courses of whole rectangles and 2x2 clumps, never a dither or random height
// field: the mesher takes each patch whole, and a dithered bed costs ten hedges.
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type Color, type VoxelBuilder } from '../voxelgen.ts';

// Two layers, level with PAVING_VOXELS, so a bed beside a path is not a step in it.
const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

const BED = { x0: 2, x1: 13, z0: 2, z1: 13 } as const;

const SOIL = { x0: 3, x1: 12, z0: 3, z1: 12 } as const;

// A taller border at the back so the blooms in front of it stand against green.
const BORDER = { x0: 3, x1: 12, z0: 3, z1: 5 } as const;

const CLUMPS: ReadonlyArray<readonly [number, number, Color, number]> = [
  [4, 4, PALETTE.bloom.light, 2],
  [10, 4, PALETTE.stucco.light, 2],
  [5, 7, PALETTE.bloom.base, 0],
  [9, 8, PALETTE.amber.base, 0],
  [4, 10, PALETTE.amber.base, 0],
  [10, 11, PALETTE.bloom.base, 0],
];

export default defineModel({
  id: 'flowerbed-b',
  label: 'Flower Bed B',
  category: 'grounds',
  scenery: 0.5,
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { foliage, stone, stucco, teak } = PALETTE;

    plinth(b, SLAB);

    const coping = GROUND + 2;
    box(BED.x0, BED.x1, GROUND, coping - 1, BED.z0, BED.z1, stucco.base);
    box(BED.x0, BED.x1, coping, coping, BED.z0, BED.z1, stone.light);
    box(SOIL.x0, SOIL.x1, coping, coping, SOIL.z0, SOIL.z1, teak.deep);

    const mass = coping + 1;
    box(SOIL.x0, SOIL.x1, mass, mass, SOIL.z0, SOIL.z1, foliage.base);
    box(BORDER.x0, BORDER.x1, mass + 1, mass + 2, BORDER.z0, BORDER.z1, foliage.shade);

    for (const [x, z, bloom, lift] of CLUMPS) {
      const y = mass + 1 + lift;
      box(x, x + 1, y, y, z, z + 1, bloom);
    }
  },
});
