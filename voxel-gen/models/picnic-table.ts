/**
 * Picnic table: a long trestle table with a bench down either side, standing on
 * a low sand-coloured slab with a planter across each end. 32x6x16 (8 x 4 m, a
 * metre of table), a 2x1 tile. The table runs east to west and seats eight.
 *
 * The second object in the catalogue drawn for the crowd rather than for the
 * camera, and it is the `bench` again at twice the size — so the numbers that
 * matter are the same numbers, and they are worth writing down once more.
 *
 * **The slab is two layers, as the bench's is.** `PAVING_VOXELS` is two, so a
 * three-layer plinth would be a step up onto the table from the paving beside
 * it. Level with the paving, the bench plank lands 50 cm above what a person is
 * walking on and the table top 1 m, which is a picnic table.
 *
 * **The benches are a course below the table and a row clear of it**, which is
 * what lets eight people sit at it: a seated figure is clear for four courses
 * above their hips, and the table top is two rows away across the tile rather
 * than over their laps. The four columns on each side are 4 voxels — 1 m —
 * apart, the bench's own spacing.
 *
 * Unlike the bench it is on the `amenities` shelf rather than on `grounds`, and
 * that is the one thing about it the app can see. Dressing grows no spur, and a
 * picnic table with no paving within a tile of it is eight seats nobody can walk
 * to — see `crowd/domain/walkNetwork.ts`. A palm is scenery; a table is somewhere
 * people go.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** The slab, which is the whole 2x1 footprint: a model fills what it claims. */
const SLAB = { x: 0, z: 0, w: 32, d: 16, height: 2, stone: PALETTE.sand } as const;

/** First free layer above the slab, where the frame stands. */
const GROUND = SLAB.height;

/** The layer the bench planks lie in, and the one a sitter's hips rest on. */
const PLANK = GROUND + 1;
const HIPS = PLANK + 1;

/** The layer the table top lies in: one clear course above the benches. */
const TOP = PLANK + 2;

/** The table, down the middle of the tile, and the benches either side of it. */
const TABLE = { x: 8, x1: 23, z: 6, z1: 9 } as const;
const BENCH = { x: 7, x1: 24, north: 3, south: 11 } as const;

/** The columns the legs stand in, under both the table and the benches. */
const LEGS = [
  [10, 11],
  [20, 21],
] as const;

/**
 * The columns the sitters fill, four to a side.
 *
 * A figure is three voxels across and is centred on its column, so these are 4
 * apart and the outer two stand a voxel clear of the ends of the planks.
 */
const SITTERS = [9, 13, 17, 21] as const;

/** The row of each bench a sitter's hips land on: the inner one, facing the table. */
const NORTH_HIPS = BENCH.north + 1;
const SOUTH_HIPS = BENCH.south;

export default defineModel({
  id: 'picnic-table',
  label: 'Picnic Table',
  category: 'amenities',
  tiles: { x: 2, z: 1 },
  /** Eight people, four a side, every one of them looking at the table. */
  seats: [
    ...SITTERS.map((x) => ({ x, y: HIPS, z: NORTH_HIPS, facing: 0 as const })),
    ...SITTERS.map((x) => ({ x, y: HIPS, z: SOUTH_HIPS, facing: 2 as const })),
  ],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { teak } = PALETTE;

    plinth(b, SLAB);

    // The frame: one pair of legs at each end of the table, carried straight
    // out under both benches, which is what a trestle table is.
    for (const [x, x1] of LEGS) {
      box(x, x1, GROUND, TOP - 1, TABLE.z, TABLE.z1, teak.deep);
      box(x, x1, GROUND, PLANK - 1, BENCH.north, BENCH.north + 1, teak.deep);
      box(x, x1, GROUND, PLANK - 1, BENCH.south, BENCH.south + 1, teak.deep);
    }

    // The two bench planks, each laid as one course. Slats are what a bench is
    // made of and exactly what this grid cannot hold — see `bench.ts`.
    for (const z of [BENCH.north, BENCH.south]) {
      box(BENCH.x, BENCH.x1, PLANK, PLANK, z, z + 1, teak.base);
    }

    // The apron under the table top, spanning the legs, so the table reads as a
    // table from the side rather than as a plank floating over two posts.
    box(TABLE.x, TABLE.x1, TOP - 1, TOP - 1, TABLE.z + 1, TABLE.z1 - 1, teak.shade);
    // The top itself, a course lighter than the frame it lies on.
    box(TABLE.x, TABLE.x1, TOP, TOP, TABLE.z, TABLE.z1, teak.light);

    // A planter across each end of the slab, filling the tile the table does
    // not reach. A box rather than a pair of pots, which is the bench's lesson
    // at twice the size: a pot stands six courses, taller than the table it is
    // meant to dress, so two of them turn the ends of the slab into two towers
    // with a table between them. A planter stands three and reads as a border.
    for (const x of [3, 28]) {
      // Two greens rather than the part's default red-yellow-green: eight
      // voxels of three colours is bunting, which is the one thing a planter
      // must not read as beside a table this size. See `props.ts`.
      flowerBox(b, {
        x,
        z: 4,
        y: GROUND,
        w: 8,
        along: 'z',
        blooms: [PALETTE.foliage.base, PALETTE.foliage.light],
      });
    }
  },
});
