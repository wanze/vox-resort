import { postRailing, TIMBER } from '../parts/flight.ts';
import { defineModel, PAVING_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'boardwalk-railing',
  label: 'Boardwalk Handrail',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  // Never picked: the layout stands it wherever a drop runs beside a boardwalk.
  groundDecides: true,
  build: (b: VoxelBuilder) => postRailing(b, () => PAVING_VOXELS - 1, TIMBER, 'left'),
});
