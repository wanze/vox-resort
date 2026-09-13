/**
 * Bridge railing: the parapet along one edge of a bridge's deck — a trestle
 * standing in the water, a timber rail a metre over the planking, and a lantern
 * on top. 16x2 of a 16x16 tile, so a corner of a platform takes two.
 *
 * **Where it stands.** Along the *north* edge of its tile unturned, and a turn
 * of one swings that round to the west — the convention `railing.ts` guards by,
 * and `placeOnEdge` in `resortLayout.ts` is what stands it flush against the
 * edge. It stands on the tile at the *water's* height, as every rail stands on
 * its tile's own level; the trestle is what carries it the metre up to the deck.
 *
 * **Why it is a model and not part of the deck.** A deck that drew its own
 * parapet drew it on both flanks whatever was beside them, so the junction of two
 * crossings had a rail across it. `railings.ts` stands this only along edges with
 * nothing paved beyond them — see `parts/span.ts`.
 *
 * **The lantern** is what lights a crossing after dark, and there is one per
 * railed edge: at the middle of it, so the two flanks of a crossing light each
 * other's planking and a platform is lit round its rim. The scene turns it on
 * with every other lamp on the plot.
 *
 * Nobody picks it: see `groundDecides` below.
 */
import {
  LANTERN,
  lanternLight,
  PARAPET_RAIL,
  spanLantern,
  spanParapet,
  type LanternSpot,
} from '../parts/span.ts';
import { BRIDGE_VOXELS, defineModel, TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

/** The deck's own planking layer, which `bridge.ts` lays at the same height. */
const PLANKS = BRIDGE_VOXELS - 1;

/** In the middle of the edge, so it stays put however the rail is turned. */
const LAMP: LanternSpot = { x: TILE_VOXELS / 2 - 1, rail: PLANKS + PARAPET_RAIL };

export default defineModel({
  id: 'bridge-railing',
  label: 'Bridge Railing',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  // Never picked: a parapet is what an open edge of a crossing puts there, so
  // the palette leaves it out and the layout stands it. See `groundDecides`.
  groundDecides: true,
  emissive: [LANTERN],
  lights: [lanternLight(LAMP)],
  build: (b: VoxelBuilder) => {
    spanParapet(b, { planksAt: () => PLANKS });
    spanLantern(b, LAMP);
  },
});
