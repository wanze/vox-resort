import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

// Along the back and down the far side, so the camera looks into the corner, not at a wall.
const WALL = { x: 3, x1: 12, z: 2, z1: 4, top: GROUND + 10 } as const;
const RETURN = { x: 12, x1: 13, z: 5, z1: 9, top: GROUND + 6 } as const;

const PIPE = { x: 7, x1: 8, z: WALL.z1 + 1 } as const;

const ARM = GROUND + 9;

// Four voxels clear of the wall: closer, the stream merges with it from every angle.
const ROSE = PIPE.z + 4;

const SLATS = [6, 9, 12] as const;

const BOARD = { x: 4, x1: 11 } as const;

export default defineModel({
  id: 'beach-shower-b',
  label: 'Beach Shower B',
  category: 'amenities',
  tiles: { x: 1, z: 1 },
  venue: {
    shelter: 'open',
    role: 'service',
    satisfies: [{ need: 'hygiene', amount: 0.6 }],
    capacity: 1,
    dwellSeconds: { min: 30, max: 90 },
    spots: [{ x: PIPE.x1, y: GROUND + 1, z: ROSE, facing: 0 }],
    doors: [{ x: PIPE.x1, z: SLATS.at(-1)! + 1, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const { bloom, metal, stucco, teak, terracotta } = PALETTE;

    plinth(b, SLAB);

    for (const wall of [WALL, RETURN]) {
      b.box(wall.x, wall.x1, GROUND, wall.top - 1, wall.z, wall.z1, stucco.base);
    }
    b.box(WALL.x, WALL.x1, WALL.top, WALL.top, WALL.z, WALL.z1, terracotta.base);

    // Slats with sand between them: a gap is geometry, where a painted stripe is a quad each.
    for (const z of SLATS) b.box(BOARD.x, BOARD.x1, GROUND, GROUND, z, z + 1, teak.base);

    b.box(PIPE.x, PIPE.x1, GROUND + 3, ARM, PIPE.z, PIPE.z, metal.base);
    b.box(PIPE.x, PIPE.x1, ARM, ARM, PIPE.z, ROSE, metal.base);
    b.box(PIPE.x, PIPE.x1, ARM - 1, ARM - 1, ROSE, ROSE, metal.light);

    // Painted as albedo, not declared as `water`: the sea shader assumes a horizontal
    // surface. It stops short of the boards so it reads as spray, not a blue post.
    b.box(PIPE.x, PIPE.x1, ARM - 5, ARM - 2, ROSE, ROSE, PALETTE.water.light);

    b.box(
      RETURN.x - 1,
      RETURN.x - 1,
      GROUND + 2,
      GROUND + 5,
      RETURN.z + 1,
      RETURN.z + 2,
      bloom.base,
    );

    pottedPlant(b, { x: 13, z: 12, y: GROUND });
  },
});
