import { PALETTE } from '../palette.ts';
import { defineModel, PAVING_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

// The kerb's own height, so the post sits flush in the corner the two kerbs beside it leave.
const KERB_HEIGHT = 1;

export default defineModel({
  id: 'kerb-post',
  label: 'Kerb post',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  // Never picked: the layout stands it where two kerbs meet across a corner of open ground.
  groundDecides: true,
  build: (b: VoxelBuilder) => {
    const top = PAVING_VOXELS + KERB_HEIGHT - 1;
    b.box(0, 0, PAVING_VOXELS, top, 0, 0, PALETTE.sand.light);
    // The foot keeps the origin at the ground, diagonal from the post so it shares no face plane
    // with the paving's sides.
    b.box(1, 1, 0, PAVING_VOXELS - 2, 1, 1, PALETTE.sand.light);
  },
});
