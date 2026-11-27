// Whole rectangles and upright spikes, never a dither or random height field: the mesher takes
// each patch whole, and a dithered bed costs ten hedges.
import { PALETTE } from '../palette.ts';
import { defineModel, type Color, type VoxelBuilder } from '../voxelgen.ts';

const BED = { x0: 2, x1: 13, z0: 2, z1: 13 } as const;

const SOIL = { x0: 3, x1: 12, z0: 3, z1: 12 } as const;

// The lowest course sinks half into the terrain.
const WALL_COURSES = 3;

// A tall border at the back so the low blooms in front of it stand against green.
const BORDER = { x0: 3, x1: 12, z0: 3, z1: 5, tall: 3 } as const;

// Foxglove-like spikes out of the border, one voxel thick so they read as stems, not blocks.
const SPIKES: ReadonlyArray<readonly [number, number, Color]> = [
  [4, 4, PALETTE.bloom.light],
  [7, 3, PALETTE.stucco.light],
  [9, 5, PALETTE.bloom.light],
  [11, 4, PALETTE.stucco.light],
];
const SPIKE_TALL = 2;

// Bedding plants in front of the border, each with its own height.
const CLUMPS: ReadonlyArray<readonly [number, number, number, number, number, Color]> = [
  [3, 5, 7, 8, 2, PALETTE.amber.base],
  [7, 8, 6, 7, 1, PALETTE.bloom.base],
  [10, 12, 7, 9, 2, PALETTE.bloom.base],
  [4, 5, 10, 11, 1, PALETTE.bloom.base],
  [7, 9, 9, 11, 2, PALETTE.amber.light],
  [11, 12, 11, 12, 1, PALETTE.amber.base],
];

export default defineModel({
  id: 'flowerbed-b',
  label: 'Flower Bed B',
  category: 'grounds',
  scenery: 0.5,
  tiles: { x: 1, z: 1 },
  onTerrain: true,
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { foliage, stone, stucco, teak } = PALETTE;

    const coping = WALL_COURSES - 1;
    box(BED.x0, BED.x1, 0, coping - 1, BED.z0, BED.z1, stucco.base);
    box(BED.x0, BED.x1, coping, coping, BED.z0, BED.z1, stone.light);
    box(SOIL.x0, SOIL.x1, coping, coping, SOIL.z0, SOIL.z1, teak.deep);

    const soil = coping + 1;
    box(SOIL.x0, SOIL.x1, soil, soil, BORDER.z1 + 1, SOIL.z1, foliage.base);
    box(BORDER.x0, BORDER.x1, soil, soil + BORDER.tall - 1, BORDER.z0, BORDER.z1, foliage.shade);

    const spikeFoot = soil + BORDER.tall;
    for (const [x, z, color] of SPIKES)
      box(x, x, spikeFoot, spikeFoot + SPIKE_TALL - 1, z, z, color);

    // Green to the last course, so a clump is a plant in flower rather than a painted block.
    for (const [x0, x1, z0, z1, tall, color] of CLUMPS) {
      const crown = soil + tall;
      if (tall > 1) box(x0, x1, soil + 1, crown - 1, z0, z1, foliage.shade);
      box(x0, x1, crown, crown, z0, z1, color);
    }
  },
});
