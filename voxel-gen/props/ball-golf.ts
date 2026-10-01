import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// The tennis ball's one voxel: smaller would vanish from the overview camera.
export default defineModel({
  id: 'ball-golf',
  label: 'Golf Ball',
  category: 'props',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    b.set(0, 0, 0, PALETTE.stucco.light);
  },
});
