import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

// A box, not a cylinder: a six-voxel circle is a chipped box anyway.
const DRUM = { x: 5, x1: 10, z: 5, z1: 10 } as const;

const COLLAR = { x: 4, x1: 11, z: 4, z1: 11 } as const;

const MOUTH = { x: 6, x1: 9, z: 6, z1: 9 } as const;

const DRUM_HEIGHT = 4;

export default defineModel({
  id: 'litter-bin',
  label: 'Litter Bin',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  binReach: 3,
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { metal, teak } = PALETTE;

    plinth(b, SLAB);

    const top = GROUND + DRUM_HEIGHT - 1;
    box(DRUM.x, DRUM.x1, GROUND, top, DRUM.z, DRUM.z1, teak.base);
    box(DRUM.x, DRUM.x1, GROUND, GROUND, DRUM.z, DRUM.z1, teak.shade);
    box(DRUM.x, DRUM.x1, top - 1, top - 1, DRUM.z, DRUM.z1, teak.shade);

    box(COLLAR.x, COLLAR.x1, top + 1, top + 1, COLLAR.z, COLLAR.z1, metal.base);
    box(MOUTH.x, MOUTH.x1, top + 1, top + 1, MOUTH.z, MOUTH.z1, metal.deep);
  },
});
