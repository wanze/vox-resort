import {
  LANTERN,
  lanternLight,
  PARAPET_RAIL,
  rampPlanksAt,
  spanLantern,
  spanParapet,
  type LanternSpot,
} from '../parts/span.ts';
import { defineModel, TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

const along = (x: number): number => TILE_VOXELS - 1 - x;

const LAMP: LanternSpot = { x: TILE_VOXELS - 2, rail: rampPlanksAt(0) + PARAPET_RAIL };

// A separate model from the left rail because a mirror is not a quarter turn.
export default defineModel({
  id: 'bridge-ramp-railing-right',
  label: 'Bridge Ramp Railing (Right)',
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
