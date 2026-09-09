/**
 * Handrail: a run of timber posts and a rail along one edge of a path tile, for
 * where the paving runs along the top of a terrace and the ground beside it
 * drops away. 16x2 of a 16x16 tile, so three of them can guard three edges of
 * the same tile.
 *
 * **Where it stands.** Along the *north* edge of its tile unturned, and a turn
 * of one swings that round to the west — the same convention `stairs.ts` climbs
 * by, so one model and a quarter turn guard all four edges a path can have a
 * drop on. Unlike everything else on the plot it is not centred in its footprint
 * but stood flush against the edge it guards; `placeOnEdge` in `resortLayout.ts`
 * is what does that, and it is the only thing this model asks of the app.
 *
 * Nobody picks it either: a handrail is not something you place, it is what the
 * ground beside a path puts there. See `groundDecides` below and `railings.ts`
 * for the rule.
 *
 * **Why it lines up.** The posts are painted from `y = 0` so the model's own
 * base sits on the terrace surface, which is where a placement puts it; the two
 * voxels of them that fall inside the path slab are buried by the paving it
 * stands on, exactly as a real post is by the paving it is set into. The rail
 * comes out an even metre above that slab, which is what a handrail is.
 */
import { defineModel, TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

/** Top surface of the path slab this stands on; see `stairs.ts`. */
const PAVING_TOP = 2;

/** How far the handrail stands above the paving, in voxels. A voxel is 25 cm. */
const RAIL_HEIGHT = 4;

export default defineModel({
  id: 'railing',
  label: 'Handrail',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  // Never picked: a handrail is what a drop beside a path puts there, so the
  // palette leaves it out and the layout stands it. See `groundDecides`.
  groundDecides: true,
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);

    const C = {
      post: 0xb08d5f,
      rail: 0xe4d9c4,
    };

    const N = TILE_VOXELS - 1;
    const top = PAVING_TOP + RAIL_HEIGHT;

    // Posts at both ends and one in the middle, painted from the ground up so
    // the model's base lands on the terrace and the paving buries their feet.
    for (const x of [0, Math.floor(TILE_VOXELS / 2) - 1, TILE_VOXELS - 2]) {
      box(x, x + 1, 0, top - 1, 0, 1, C.post);
    }
    // The rail itself, and a lower one under it so the run does not read as a
    // line floating over the paving.
    box(0, N, top - 1, top, 0, 1, C.rail);
    box(0, N, PAVING_TOP + 1, PAVING_TOP + 1, 0, 1, C.rail);
  },
});
