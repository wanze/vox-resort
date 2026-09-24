import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type Color, type VoxelBuilder } from '../voxelgen.ts';

const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

const POST = { x: 7, x1: 8, z: 7, z1: 8 } as const;

const POST_HEIGHT = 11;

interface Finger {
  readonly points: 'x-' | 'x+' | 'z+';
  readonly y: number;
  readonly band: Color;
}

// Only three sides on purpose: a board on every side reads as a box and hides the post.
const FINGERS: readonly Finger[] = [
  { points: 'x+', y: 10, band: PALETTE.bloom.base },
  { points: 'x-', y: 8, band: PALETTE.amber.base },
  { points: 'z+', y: 6, band: PALETTE.foliage.base },
];

const REACH = 6;

export default defineModel({
  id: 'sign-post',
  label: 'Sign Post',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { stucco, teak } = PALETTE;

    plinth(b, SLAB);

    const top = GROUND + POST_HEIGHT - 1;
    box(POST.x, POST.x1, GROUND, top, POST.z, POST.z1, teak.base);
    // One shaded face makes a two-voxel post read as round.
    box(POST.x1, POST.x1, GROUND, top, POST.z1, POST.z1, teak.shade);
    box(POST.x - 1, POST.x1 + 1, top + 1, top + 1, POST.z - 1, POST.z1 + 1, teak.light);

    for (const finger of FINGERS) {
      const span =
        finger.points === 'x+'
          ? { x: POST.x1 + 1, x1: POST.x1 + REACH, z: POST.z, z1: POST.z1 }
          : finger.points === 'x-'
            ? { x: POST.x - REACH, x1: POST.x - 1, z: POST.z, z1: POST.z1 }
            : { x: POST.x, x1: POST.x1, z: POST.z1 + 1, z1: POST.z1 + REACH };
      box(span.x, span.x1, finger.y, finger.y, span.z, span.z1, finger.band);
      box(span.x, span.x1, finger.y + 1, finger.y + 1, span.z, span.z1, stucco.light);
    }
  },
});
