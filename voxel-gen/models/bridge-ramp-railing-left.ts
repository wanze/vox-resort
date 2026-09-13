/**
 * Bridge ramp railing, left: the parapet up the left-hand flank, as you look up the climb from the bank — the east flank of an unturned ramp, which is the edge a turn of three stands it on. It steps with the
 * treads, stands on a trestle in the water like the deck's railing does, and
 * carries the lantern that marks the bank end of a crossing.
 * 16x2 of a 16x16 tile.
 *
 * **Where it stands.** On the ramp's own tile, flush against the flank it
 * guards — `placeOnEdge` in `resortLayout.ts` stands it, as it stands every
 * edge rail. Drawn along the north edge, it rises towards +x, which a turn of three swings round to run up the ramp's east flank; the ramp's
 * turn plus that quarter is the rail's turn, so it climbs with the ramp whichever
 * bank the ramp comes off. `railings.ts` is where that sum is done.
 *
 * **Why there are two.** The parapet up one flank of a climb is the mirror of
 * the one up the other, and a mirror is not a quarter turn. `stair-railing.ts`
 * solves the same problem by carrying both flanks in one model, which is right
 * for a flight — a wide staircase is left open altogether — and wrong for a
 * bridge, where two crossings side by side are one wide deck railed along its
 * outer flanks only.
 *
 * Nobody picks it: see `groundDecides` below.
 */
import {
  LANTERN,
  lanternLight,
  PARAPET_RAIL,
  rampPlanksAt,
  spanLantern,
  spanParapet,
  type LanternSpot,
} from '../parts/span.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** How far up the climb a voxel along this edge is. */
const along = (x: number): number => x;

/** At the bank end, on the lowest tread's rail: the lamp you walk onto the bridge by. */
const LAMP: LanternSpot = { x: 0, rail: rampPlanksAt(0) + PARAPET_RAIL };

export default defineModel({
  id: 'bridge-ramp-railing-left',
  label: 'Bridge Ramp Railing (Left)',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  // Never picked: see `bridge-railing.ts`.
  groundDecides: true,
  emissive: [LANTERN],
  lights: [lanternLight(LAMP)],
  build: (b: VoxelBuilder) => {
    spanParapet(b, { planksAt: (x) => rampPlanksAt(along(x)) });
    spanLantern(b, LAMP);
  },
});
