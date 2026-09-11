/**
 * Sign post: a timber post carrying three fingerboards, each pointing a
 * different way at a different height, on a low sand-coloured slab.
 * 16x16x17 (a 3.5 m post on a 4 m tile), a 1x1 tile.
 *
 * The same slab the bench, the hedge, the flower bed and the litter bin stand
 * on — two layers of `sand`, level with `PAVING_VOXELS`, because these are the
 * things that stand along a walk and `path` is laid in the sandy family.
 *
 * **The boards say nothing, so they have to say it by colour.** There is no
 * lettering at 25 cm a voxel — a letter is a dither across a face, which is the
 * one thing `docs/art-direction.md` forbids — so each board is two courses: a
 * band of `bloom`, `amber` or `foliage` under a face of `stucco`. Three
 * destinations in three colours is what a fingerpost reads as from the height
 * the ground is ever seen at, and each board is four rectangles rather than
 * forty.
 *
 * **The three point three different ways at three different heights**, which is
 * the other half of it. Three arms at one height on one post is a weather vane;
 * staggered down the post they read as a junction sign, and — because they are
 * staggered — no two of them ever have to share a course with each other.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type Color, type VoxelBuilder } from '../voxelgen.ts';

/** The slab, which is the whole tile: a model fills the footprint it claims. */
const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

/** First free layer above the slab, where the post stands. */
const GROUND = SLAB.height;

/** The post: two voxels square, on the middle of the tile. */
const POST = { x: 7, x1: 8, z: 7, z1: 8 } as const;

/** Layers of post above the slab. Fourteen is three and a half metres. */
const POST_HEIGHT = 14;

/** One fingerboard: the way it points, and the lowest of its two courses. */
interface Finger {
  readonly points: 'x-' | 'x+' | 'z+';
  readonly y: number;
  readonly band: Color;
}

/**
 * The three boards, tallest first.
 *
 * Only three of the four compass points, and the fourth is left off on purpose:
 * a post with a board on every side is a box, and the gap is what lets the eye
 * find the post inside them.
 */
const FINGERS: readonly Finger[] = [
  { points: 'x+', y: 12, band: PALETTE.bloom.base },
  { points: 'x-', y: 9, band: PALETTE.amber.base },
  { points: 'z+', y: 6, band: PALETTE.foliage.base },
];

/** How far a board reaches out from the post. Six voxels is a metre and a half. */
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
    // One shaded face, which is what makes a two-voxel post read as round
    // rather than as a square column — the street lamp's trick.
    box(POST.x1, POST.x1, GROUND, top, POST.z1, POST.z1, teak.shade);
    // A cap, so the post ends in something rather than simply stopping.
    box(POST.x - 1, POST.x1 + 1, top + 1, top + 1, POST.z - 1, POST.z1 + 1, teak.light);

    for (const finger of FINGERS) {
      // The board runs out from the post along one axis and is two voxels deep
      // across the other, which is the post's own thickness: a fingerboard is a
      // plank on the side of a post, not a flag on a string.
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
