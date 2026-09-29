import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

const SHAFT = { x: 6, x1: 8, z: 6, z1: 8 } as const;

const SHAFT_HEIGHT = 10;

interface Board {
  readonly points: 'x-' | 'x+' | 'z+';
  readonly y: number;
}

// Blank, like every sign in the references; staggered in height so no board hides
// another from the camera.
const BOARDS: readonly Board[] = [
  { points: 'x+', y: 9 },
  { points: 'x-', y: 7 },
  { points: 'z+', y: 5 },
];

const REACH = 5;

export default defineModel({
  id: 'sign-post-b',
  label: 'Sign Post B',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { stone, stucco, teak, terracotta } = PALETTE;

    plinth(b, SLAB);

    box(SHAFT.x - 1, SHAFT.x1 + 1, GROUND, GROUND, SHAFT.z - 1, SHAFT.z1 + 1, stone.base);
    const top = GROUND + SHAFT_HEIGHT;
    box(SHAFT.x, SHAFT.x1, GROUND + 1, top - 1, SHAFT.z, SHAFT.z1, stucco.base);
    // A whitewashed pier with a tiled cap, like the villa's gate piers.
    box(SHAFT.x - 1, SHAFT.x1 + 1, top, top, SHAFT.z - 1, SHAFT.z1 + 1, terracotta.base);

    const mid = SHAFT.z + 1;
    const centre = SHAFT.x + 1;
    for (const { points, y } of BOARDS) {
      const [x0, x1, z0, z1] =
        points === 'x+'
          ? [SHAFT.x1 + 1, SHAFT.x1 + REACH, mid, mid]
          : points === 'x-'
            ? [SHAFT.x - REACH, SHAFT.x - 1, mid, mid]
            : [centre, centre, SHAFT.z1 + 1, SHAFT.z1 + REACH];
      box(x0, x1, y, y + 2, z0, z1, teak.light);
    }
  },
});
