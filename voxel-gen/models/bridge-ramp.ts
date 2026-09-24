// The turn points at the bank, the foot of the climb, where a flight of stairs points at its head.
import { PALETTE } from '../palette.ts';
import {
  FLANK,
  RAMP_GOING,
  RAMP_TREADS,
  rampPlanksAt,
  spanDeck,
  spanPiles,
} from '../parts/span.ts';
import { defineModel, PAVING_VOXELS, TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'bridge-ramp',
  label: 'Bridge Ramp',
  category: 'grounds',
  groundDecides: true,
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const { teak } = PALETTE;
    const N = TILE_VOXELS - 1;

    for (let step = 0; step < RAMP_TREADS; step++) {
      const z0 = step * RAMP_GOING;
      spanDeck(b, { y: rampPlanksAt(z0), z0, z1: z0 + RAMP_GOING - 1 });
    }

    // Held in off both flanks, where a railing's trestle stands wherever the flank is railed.
    b.box(FLANK, N - FLANK, 0, PAVING_VOXELS - 2, 0, RAMP_GOING - 1, teak.deep);

    for (const step of [RAMP_TREADS - 2, RAMP_TREADS - 1]) {
      const z0 = step * RAMP_GOING;
      spanPiles(b, { beam: rampPlanksAt(z0) - 1, rows: [z0] });
    }
  },
});
