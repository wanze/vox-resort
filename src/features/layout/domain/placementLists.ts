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

export const PROP_IDS: ReadonlySet<string> = new Set([LAMP_ID, HEDGE_ID]);

// Rails claim no ground: filed with the lamps they would be indexed, shadowed and
// baked as though they stood on the tile they only lean against.
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
