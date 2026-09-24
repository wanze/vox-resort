// Flat courses of whole rectangles, never a dither or random height field: the old
// bed did that and cost 470 triangles, ten times a hedge.
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// Two layers, level with PAVING_VOXELS, so a bed beside a path is not a step in it.
const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

const BED = { x0: 2, x1: 13, z0: 2, z1: 13 } as const;

const SOIL = { x0: 3, x1: 12, z0: 3, z1: 12 } as const;

const CUSHION = { x0: 4, x1: 11, z0: 4, z1: 11 } as const;

// 2x2 clumps rather than single cells, so the mesher can take each patch whole.
const CLUMPS: ReadonlyArray<readonly [number, number, boolean]> = [
  [5, 5, true],
  [9, 5, false],
  [5, 9, false],
  [9, 9, true],
];

export default defineModel({
  id: 'flowerbed',
  label: 'Flower Bed',
  category: 'grounds',
  scenery: 0.5,
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, terracotta, teak } = PALETTE;

    plinth(b, SLAB);

    const coping = GROUND + 1;
    box(BED.x0, BED.x1, GROUND, coping, BED.z0, BED.z1, terracotta.shade);
    box(BED.x0, BED.x1, coping, coping, BED.z0, BED.z1, terracotta.base);
    box(SOIL.x0, SOIL.x1, GROUND, coping, SOIL.z0, SOIL.z1, teak.deep);

    const mass = coping + 1;
    box(SOIL.x0, SOIL.x1, mass, mass, SOIL.z0, SOIL.z1, foliage.shade);
    box(CUSHION.x0, CUSHION.x1, mass + 1, mass + 1, CUSHION.z0, CUSHION.z1, foliage.base);

    for (const [x, z, red] of CLUMPS) {
      box(x, x + 1, mass + 2, mass + 2, z, z + 1, red ? bloom.base : amber.base);
    }
  },
});
