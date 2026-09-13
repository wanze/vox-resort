/**
 * Pier railing: the handrail along one edge of a jetty, with a lantern on its
 * middle post. 16x2 of a 16x16 tile, so the head of a pier takes three.
 *
 * **Where it stands.** Exactly where `railing.ts` does — along the *north* edge
 * of its tile unturned, a turn of one swinging that round to the west, stood
 * flush against the edge by `placeOnEdge` in `resortLayout.ts` — and it is the
 * same run of posts and rails in the same places. `railings.ts` stands this one
 * instead of that one on a tile that is itself over the sea, which is the only
 * difference between the two rules.
 *
 * **Why it is a model of its own.** For the lantern: a pier is walked out into
 * the dark, and one lamp per railed edge lights it end to end after nightfall
 * without anybody placing a lamp. The terrace rail it is copied from lines every
 * bench on the hill, and a lamp on each of those would be a lamp on every edge
 * of the resort. It is painted in teak, the timber the jetty and the bridge
 * railings are, rather than the pale rail of the terraces.
 *
 * **The buried feet** are drawn a voxel in from the tile's edge for the reason
 * `railing.ts` gives: flush, they would share a face plane with the jetty's own
 * outer face and fight it for every fragment.
 *
 * Nobody picks it: see `groundDecides` below.
 */
import { PALETTE } from '../palette.ts';
import { LANTERN, lanternLight, spanLantern, type LanternSpot } from '../parts/span.ts';
import { defineModel, PAVING_VOXELS, TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

/** How far the handrail stands above the decking, in voxels. A voxel is 25 cm. */
const RAIL_HEIGHT = 4;

/** How far in from the tile's edge the buried feet are drawn; see `railing.ts`. */
const BURIED_IN = 1;

const N = TILE_VOXELS - 1;
const TOP = PAVING_VOXELS + RAIL_HEIGHT;

/** On the middle post, so it stays put however the rail is turned. */
const MIDDLE = Math.floor(TILE_VOXELS / 2) - 1;
const LAMP: LanternSpot = { x: MIDDLE, rail: TOP };

export default defineModel({
  id: 'pier-railing',
  label: 'Pier Railing',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  // Never picked: a pier's rail is what the water beside it puts there. See
  // `groundDecides`.
  groundDecides: true,
  emissive: [LANTERN],
  lights: [lanternLight(LAMP)],
  build: (b: VoxelBuilder) => {
    const { teak } = PALETTE;
    const inward = (v: number): number => Math.min(N - BURIED_IN, Math.max(BURIED_IN, v));

    // Posts at both ends and one in the middle, each with a foot carried down
    // into the decking so the model's base lands on the water.
    for (const x of [0, MIDDLE, TILE_VOXELS - 2]) {
      b.box(x, x + 1, PAVING_VOXELS, TOP - 1, 0, 1, teak.shade);
      b.box(inward(x), inward(x + 1), 0, PAVING_VOXELS - 1, inward(0), inward(1), teak.shade);
    }
    // The rail, and a lower one under it so the run does not float over the planks.
    b.box(0, N, TOP - 1, TOP, 0, 1, teak.light);
    b.box(0, N, PAVING_VOXELS + 1, PAVING_VOXELS + 1, 0, 1, teak.light);
    spanLantern(b, LAMP);
  },
});
