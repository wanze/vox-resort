import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

// Whitewashed like the walls around it, so a bin by a villa reads as built in, not bought.
const BODY = { x: 5, x1: 10, z: 5, z1: 10 } as const;

const FOOT = { x: 4, x1: 11, z: 4, z1: 11 } as const;

const MOUTH = { x: 6, x1: 9, z: 6, z1: 9 } as const;

const BODY_HEIGHT = 4;

export default defineModel({
  id: 'litter-bin-b',
  label: 'Litter Bin B',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  binReach: 3,
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { metal, stone, stucco } = PALETTE;

    plinth(b, SLAB);

    box(FOOT.x, FOOT.x1, GROUND, GROUND, FOOT.z, FOOT.z1, stone.base);
    const top = GROUND + BODY_HEIGHT;
    box(BODY.x, BODY.x1, GROUND + 1, top - 1, BODY.z, BODY.z1, stucco.base);
    box(FOOT.x, FOOT.x1, top, top, FOOT.z, FOOT.z1, stone.light);

    // The hole sits a course below a metal liner: flush with the coping it reads as a lid.
    box(MOUTH.x, MOUTH.x1, top, top, MOUTH.z, MOUTH.z1, metal.base);
    box(MOUTH.x + 1, MOUTH.x1 - 1, top - 1, top - 1, MOUTH.z + 1, MOUTH.z1 - 1, metal.deep);
    for (const [x, z] of [
      [MOUTH.x + 1, MOUTH.z + 1],
      [MOUTH.x1 - 1, MOUTH.z + 1],
      [MOUTH.x + 1, MOUTH.z1 - 1],
      [MOUTH.x1 - 1, MOUTH.z1 - 1],
    ] as const) {
      b.del(x, top, z);
    }
  },
});
