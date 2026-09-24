// The mirror of the right-hand railing: a mirror is not a quarter turn, so each flank
// needs its own model.
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

const along = (x: number): number => x;

const LAMP: LanternSpot = { x: 0, rail: rampPlanksAt(0) + PARAPET_RAIL };

export default defineModel({
  id: 'bridge-ramp-railing-left',
  label: 'Bridge Ramp Railing (Left)',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  emissive: [LANTERN],
  lights: [lanternLight(LAMP)],
  build: (b: VoxelBuilder) => {
    spanParapet(b, { planksAt: (x) => rampPlanksAt(along(x)) });
    spanLantern(b, LAMP);
  },
});
