/**
 * Bridge tile: the middle of the span a path becomes where it crosses a river or
 * a lake — a boarded timber deck a metre above the water, on trestles standing
 * in it, railed down both flanks.
 * 16x16 footprint, fits a 1x1 ground tile.
 *
 * **It stands `BRIDGE_VOXELS` proud of the tile rather than `PAVING_VOXELS`**,
 * which is the one thing it does not share with the other four pavings. The
 * water inland is flush with the banks either side of it — see
 * `layout/domain/terrain.ts` for why it is flush and not dug — so a deck at the
 * path's own height is a path with blue painted under it. Lifted a metre you can
 * see the river run beneath it, and `bridge-ramp.ts` is the tile that climbs to
 * it off either bank. Between them a crossing comes out as a stepped approach, a
 * level deck and a stepped approach: the middle is off the ground, which is what
 * makes it read as a bridge from the side rather than as blue paving.
 *
 * A two-tile crossing — which is every crossing of the river a bare plot is
 * handed, because `river.ts` runs a channel two tiles wide — is two ramps
 * meeting at their heads and no tile of this at all. This is what the middle of
 * a wider lake takes.
 *
 * **It is turned along the crossing**, where the masonry it replaced was laid
 * unturned and had to be a bond with no grain in it for exactly that reason.
 * That is what `spans.ts` buys: a bridge tile is asked which way the crossing
 * runs before it goes down, so the deck can be planked *across* the run the way
 * a real one is and the parapets can stand on the two flanks you could fall off
 * rather than on the two the road comes in at. Unturned the crossing runs along
 * z, which is the axis `bridge-ramp.ts` climbs.
 *
 * **It carries its own parapet**, which is the other thing that changed.
 * `railings.ts` stands a handrail along every paved edge with water beyond it,
 * and that is exactly right for a jetty, whose deck is at the sea's own height —
 * but a rail stood on the *ground* beside a deck a metre up is a rail in the
 * water. So a raised span is the one paving the rail rule skips, and the parapet
 * is drawn here, where it can sit on the planking it guards.
 *
 * Nobody picks it: the palette offers `path`, and a path drawn over inland water
 * comes out as this. See `groundDecides` below, and `jetty.ts`, which is the
 * span the *sea* takes — a pier is timber walked out from a shore and a bridge
 * is a deck carried across, and which of the two a tile gets is the only paving
 * question the bay and a river answer differently.
 */
import { spanDeck } from '../parts/span.ts';
import { BRIDGE_VOXELS, defineModel, TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'bridge',
  label: 'Bridge',
  category: 'grounds',
  // Never picked: a bridge is what a path becomes over a river, so the palette
  // leaves it out and the paving lays it. See `groundDecides`.
  groundDecides: true,
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    // Planks in the layer under the walking surface, and the trestles carried
    // all the way down to the bed of the channel.
    spanDeck(b, { y: BRIDGE_VOXELS - 1, z0: 0, z1: TILE_VOXELS - 1, foot: 0 });
  },
});
