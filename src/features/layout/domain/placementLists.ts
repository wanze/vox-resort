/**
 * Which of a plot's four lists a placement is counted in.
 *
 * The HUD reports objects, dressing and paving separately, and an object placed
 * by hand belongs in the same column the layout would have put it in — so the
 * ids the layout derives for itself go to their own lists and everything else
 * counts as an object.
 *
 * A name rather than the list itself, because the lists belong to the plot the
 * app holds and a rule about ids should not have to know that.
 */

import {
  BRIDGE_RAILING_ID,
  BRIDGE_RAMP_RAILING_LEFT_ID,
  BRIDGE_RAMP_RAILING_RIGHT_ID,
  HEDGE_ID,
  LAMP_ID,
  PAVING_IDS,
  PIER_RAILING_ID,
  RAILING_ID,
  STAIR_RAILING_ID,
} from './resortPlan';

export type PlacementList = 'paths' | 'rails' | 'props' | 'placements';

/** The props the layout scatters itself, kept apart from the plan's own plots. */
export const PROP_IDS: ReadonlySet<string> = new Set([LAMP_ID, HEDGE_ID]);

/**
 * The rails, which are a list of their own rather than props.
 *
 * Because a rail claims no ground: everything that asks what stands on a tile
 * leaves them out, and `claimingOn` is where that is done. A rail filed with the
 * lamps would be indexed, shadowed and baked as though it stood on the tile it
 * only leans against.
 */
export const RAIL_IDS: ReadonlySet<string> = new Set([
  RAILING_ID,
  PIER_RAILING_ID,
  STAIR_RAILING_ID,
  BRIDGE_RAILING_ID,
  BRIDGE_RAMP_RAILING_LEFT_ID,
  BRIDGE_RAMP_RAILING_RIGHT_ID,
]);

export function listOf(id: string): PlacementList {
  if (PAVING_IDS.has(id)) return 'paths';
  if (RAIL_IDS.has(id)) return 'rails';
  if (PROP_IDS.has(id)) return 'props';
  return 'placements';
}
