import { PALETTE } from '../palette.ts';
import { defineModel, PAVING_VOXELS, TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

// One voxel, as anything taller reads as a trench wall from the isometric camera.
const KERB_HEIGHT = 1;

// The foot keeps the model's origin at the ground, as the railing's do. It stops a voxel under
// the paving's top and in from its sides, sharing no face plane with the paving to z-fight.
const BURIED_IN = 1;

export default defineModel({
  id: 'kerb',
  label: 'Kerb',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  // Never picked: the layout lays it wherever a path meets open ground at its own level.
  groundDecides: true,
  build: (b: VoxelBuilder) => {
    const N = TILE_VOXELS - 1;
    const top = PAVING_VOXELS + KERB_HEIGHT - 1;

    b.box(0, N, PAVING_VOXELS, top, 0, 0, PALETTE.sand.light);
    b.box(BURIED_IN, BURIED_IN, 0, PAVING_VOXELS - 2, BURIED_IN, BURIED_IN, PALETTE.sand.light);
  },
});
