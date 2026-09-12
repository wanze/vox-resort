/**
 * Bridge tile: the paving the resort uses where a path crosses a river or a lake
 * — a dressed stone deck on kerbed abutments.
 * 16x16 footprint, fits a 1x1 ground tile.
 *
 * Exactly as tall as `path.ts`, `boardwalk.ts` and `jetty.ts`, so a street runs
 * off the grass, over the water and back onto the grass without a step in it.
 * The water inland is flush with the banks either side of it — see
 * `layout/domain/terrain.ts` for why it is flush and not dug — so a bridge over
 * it really is a deck and not a span with a rise: what makes this read as a
 * bridge is the masonry rather than an arch nobody could see from above.
 *
 * **It is the fourth paving the ground chooses, and the second over water.** The
 * sea gets a jetty and inland water gets this, which is the one thing they do
 * not share: a pier is a timber structure walked *out* from a shore, and a bridge
 * is a stone one that carries a road *across*. Nobody picks either — the palette
 * offers `path` and `paving.ts` decides. See `groundDecides` below.
 *
 * **It is laid unturned, so the bond has to be indifferent to the crossing.**
 * Every other directional paving in the catalogue takes a turn from the rule
 * that lays it — a flight faces its climb, decking runs with the shore. A bridge
 * cannot: `pavingAt` knows what a tile is made of and not which way the path over
 * it was drawn. So the deck is granite setts in running bond rather than planks
 * or beams, because setts have no grain to run the wrong way: the same bond
 * reads as a road surface whether the crossing goes north or east. What does
 * carry the direction is the kerb, and it runs round the whole tile, so a
 * crossing of any shape comes out edged.
 *
 * **It has no parapets of its own**, exactly as the jetty has no rails: water
 * counts as a drop, so `railings.ts` stands a handrail along every edge of the
 * deck that has water beyond it. That is what keeps the parapets to the sides
 * you would actually fall off — a bridge two tiles wide is railed down its
 * flanks and open where it meets the road at either end — without this model
 * knowing which tile of the crossing it is.
 */
import { PALETTE } from '../palette.ts';
import { defineModel, TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

/** How wide the kerb round the deck is, in voxels. */
const KERB = 2;

/**
 * Sett size in voxels, the joint between two setts included.
 *
 * Chosen the way the flagstones and the decking boards were, and for the same
 * reason: this is a tile repeated along every crossing on the plot, and a sett
 * every two voxels is exactly the pattern the greedy mesher cannot merge. Six by
 * four is a bond that still reads as masonry from the height the ground is ever
 * seen at.
 */
const SETT = { width: 6, depth: 4 } as const;

export default defineModel({
  id: 'bridge',
  label: 'Bridge',
  category: 'grounds',
  // Never picked: a bridge is what a path becomes over a river, so the palette
  // leaves it out and the paving lays it. See `groundDecides`.
  groundDecides: true,
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);
    const { stone, slate } = PALETTE;

    const N = TILE_VOXELS - 1;

    // The abutment: a solid course spanning the whole tile, so two tiles of
    // bridge butt together and the side of the crossing is one unbroken band of
    // masonry over the water.
    box(0, N, 0, 0, 0, N, slate.deep);

    // The deck: setts in running bond, every other course offset by half a
    // sett, with a dark joint between them.
    const setts = [stone.base, stone.shade, slate.base] as const;
    for (let x = 0; x <= N; x++) {
      for (let z = 0; z <= N; z++) {
        const onKerb = x < KERB || z < KERB || x > N - KERB || z > N - KERB;
        if (onKerb) {
          // The kerb ring, a shade down where it turns a corner so the ring
          // reads as four runs of stone rather than as a painted border.
          const corner = (x < KERB || x > N - KERB) && (z < KERB || z > N - KERB);
          set(x, 1, z, corner ? stone.shade : stone.light);
          continue;
        }
        const course = Math.floor(z / SETT.depth);
        const offset = (course % 2) * (SETT.width / 2);
        const joint = z % SETT.depth === 0 || (x + offset) % SETT.width === 0;
        if (joint) {
          set(x, 1, z, slate.deep);
          continue;
        }
        const sett = Math.floor((x + offset) / SETT.width) + course;
        set(x, 1, z, setts[sett % setts.length]!);
      }
    }
  },
});
